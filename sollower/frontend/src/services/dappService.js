// frontend/src/services/dappService.js
import {
  claimAdRewardFromBackend,
  verifyPaymentOnBackend,
  getUserBalance,
  checkBackendStatus,
} from './backendTransactionService.js';
import { getTokenPrices, usdToQhubx } from './tokenPriceService.js';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const POSTS_KEY = 'sollowerPosts';
const PROFILES_KEY = 'sollowerProfiles';
const AD_REWARDS_KEY = 'sollowerAdRewards';
const ADMIN_WALLET = import.meta.env.VITE_SELLER_WALLET_ADDRESS;
const TOKEN_MINT_ADDRESS = import.meta.env.VITE_TOKEN_MINT_ADDRESS;
const TOKEN_DECIMALS = parseInt(import.meta.env.VITE_TOKEN_DECIMALS || '9', 10);

// Publication fee in USD — converted to QHUBX at runtime
const PUBLISH_COST_USD = 10;

let BACKEND_AVAILABLE = false;
(async () => {
  try {
    const status = await checkBackendStatus();
    BACKEND_AVAILABLE = status.server === 'online';
  } catch {}
})();

// ═══════════════════════════════════════════════
// SPL TOKEN PAYMENT (QHUBX only — USD calculated)
// ═══════════════════════════════════════════════

async function findOrCreateATA(connection, payer, owner, mint) {
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    await getAccount(connection, ata);
  } catch {
    // ATA doesn't exist - create it in the transfer tx
  }
  return ata;
}

async function confirmTx(connection, signature, timeout = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = value?.[0];
    if (status?.err) throw new Error(`Tx failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized')
      return signature;
    await new Promise(r => setTimeout(r, 1200));
  }
  throw new Error('Tx confirmation timeout');
}

/**
 * Pay in QHUBX tokens (amount is in USD, converted at current market rate)
 */
export async function payToAddress(wallet, connection, recipientAddress, usdAmount) {
  if (!wallet.publicKey || !wallet.signTransaction)
    throw new Error('Wallet not connected or incompatible');

  const { tokens: tokenAmount, rate } = await usdToQhubx(usdAmount);
  const mint = new PublicKey(TOKEN_MINT_ADDRESS);
  const buyer = wallet.publicKey;
  const seller = new PublicKey(recipientAddress);
  const rawAmount = BigInt(Math.round(tokenAmount * 10 ** TOKEN_DECIMALS));

  // Verify buyer balance
  const buyerATA = await getAssociatedTokenAddress(mint, buyer);
  const buyerAccount = await getAccount(connection, buyerATA);
  if (BigInt(buyerAccount.amount.toString()) < rawAmount) {
    const have = Number(buyerAccount.amount) / 10 ** TOKEN_DECIMALS;
    throw new Error(
      `Insufficient QHUBX: you have ${have.toFixed(4)} but need ${tokenAmount.toFixed(4)} ($${usdAmount} USD)`
    );
  }

  const sellerATA = await getAssociatedTokenAddress(mint, seller);

  const tx = new Transaction().add(
    createTransferInstruction(buyerATA, sellerATA, buyer, rawAmount, [], TOKEN_PROGRAM_ID)
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = buyer;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await confirmTx(connection, sig);
  console.log(`✅ Paid $${usdAmount} USD = ${tokenAmount} QHUBX @ $${rate}/token | tx: ${sig}`);
  return sig;
}

export const sendSolanaPayment = payToAddress;

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════

export const fileToBase64 = file =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload = () => res(r.result);
    r.onerror = rej;
  });

// ═══════════════════════════════════════════════
// POSTS
// ═══════════════════════════════════════════════

export const fetchRealPosts = async () => {
  try {
    const data = localStorage.getItem(POSTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const savePost = async (postData, wallet, connection) => {
  let totalUSD = 0;

  if (['sale', 'fund', 'ad'].includes(postData.type)) {
    totalUSD += PUBLISH_COST_USD;
    if (postData.type === 'ad' && postData.enableRewards && postData.totalRewardBudgetUSD) {
      totalUSD += parseFloat(postData.totalRewardBudgetUSD);
    }
  }

  if (totalUSD > 0) {
    if (!ADMIN_WALLET) throw new Error('Platform wallet not configured');
    const signature = await payToAddress(wallet, connection, ADMIN_WALLET, totalUSD);

    if (BACKEND_AVAILABLE) {
      try {
        await verifyPaymentOnBackend(signature, totalUSD, ADMIN_WALLET);
      } catch (e) {
        console.warn('Backend verification skipped:', e.message);
      }
    }
  }

  const posts = await fetchRealPosts();
  const newPost = {
    ...postData,
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    likesCount: 0,
    likedBy: [],
    comments: [],
    remainingBudgetUSD: postData.enableRewards ? postData.totalRewardBudgetUSD : 0,
    totalViews: 0,
  };

  localStorage.setItem(POSTS_KEY, JSON.stringify([newPost, ...posts]));
  return newPost;
};

export const deletePost = async postId => {
  const posts = await fetchRealPosts();
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts.filter(p => p.id !== postId)));
};

// ═══════════════════════════════════════════════
// AD REWARDS
// ═══════════════════════════════════════════════

export const claimAdReward = async (postId, userWallet, rewardPerViewUSD) => {
  const posts = await fetchRealPosts();
  const idx = posts.findIndex(p => p.id === postId);
  if (idx === -1) throw new Error('Post not found');

  const post = posts[idx];
  if ((post.remainingBudgetUSD ?? 0) < rewardPerViewUSD)
    throw new Error('Reward budget depleted');

  if (BACKEND_AVAILABLE) {
    const result = await claimAdRewardFromBackend(userWallet, rewardPerViewUSD, postId);
    if (result.success) {
      posts[idx].remainingBudgetUSD -= rewardPerViewUSD;
      posts[idx].totalViews = (posts[idx].totalViews || 0) + 1;
      localStorage.setItem(POSTS_KEY, JSON.stringify(posts));

      const log = JSON.parse(localStorage.getItem(AD_REWARDS_KEY) || '[]');
      log.push({ postId, userWallet, amountUSD: rewardPerViewUSD, timestamp: Date.now(), signature: result.signature });
      localStorage.setItem(AD_REWARDS_KEY, JSON.stringify(log));

      return { success: true, amount: rewardPerViewUSD, signature: result.signature, method: 'automatic' };
    }
  }

  // Fallback: log pending
  posts[idx].remainingBudgetUSD -= rewardPerViewUSD;
  posts[idx].totalViews = (posts[idx].totalViews || 0) + 1;
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  return { success: true, amount: rewardPerViewUSD, method: 'pending' };
};

// ═══════════════════════════════════════════════
// DONATIONS
// ═══════════════════════════════════════════════

export const processDonation = async (postId, wallet, connection, recipientWallet, usdAmount) => {
  await payToAddress(wallet, connection, recipientWallet, usdAmount);

  const posts = await fetchRealPosts();
  const idx = posts.findIndex(p => p.id === postId);
  if (idx !== -1) {
    posts[idx].raisedAmountUSD = (posts[idx].raisedAmountUSD || 0) + usdAmount;
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  }
  return { success: true, usdAmount };
};

// ═══════════════════════════════════════════════
// LIKES & COMMENTS
// ═══════════════════════════════════════════════

export const toggleLikePost = async (postId, userWallet) => {
  const posts = await fetchRealPosts();
  const idx = posts.findIndex(p => p.id === postId);
  if (idx === -1) return null;

  if (!posts[idx].likedBy) posts[idx].likedBy = [];

  if (posts[idx].likedBy.includes(userWallet)) {
    posts[idx].likedBy = posts[idx].likedBy.filter(w => w !== userWallet);
    posts[idx].likesCount = Math.max(0, (posts[idx].likesCount || 1) - 1);
  } else {
    posts[idx].likedBy.push(userWallet);
    posts[idx].likesCount = (posts[idx].likesCount || 0) + 1;
  }

  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  return posts[idx];
};

export const addCommentToPost = async (postId, commentData) => {
  const posts = await fetchRealPosts();
  const idx = posts.findIndex(p => p.id === postId);
  if (idx === -1) return null;

  const comment = {
    id: `c-${Date.now()}`,
    user: commentData.user,
    text: commentData.text,
    timestamp: Date.now(),
  };

  if (!posts[idx].comments) posts[idx].comments = [];
  posts[idx].comments.push(comment);
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  return comment;
};

// ═══════════════════════════════════════════════
// PROFILES & FOLLOWERS
// ═══════════════════════════════════════════════

export const getUserProfile = async walletAddress => {
  const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
  return profiles[walletAddress] || {
    name: '', bio: '', profileImages: [], followers: [], following: [],
  };
};

export const saveUserProfile = async (walletAddress, profileData) => {
  const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
  profiles[walletAddress] = { ...profileData, updatedAt: Date.now() };
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  return profiles[walletAddress];
};

export const toggleFollow = async (myAddress, targetAddress) => {
  if (myAddress === targetAddress) return;
  const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');

  const init = () => ({ name: '', bio: '', profileImages: [], followers: [], following: [] });
  if (!profiles[myAddress]) profiles[myAddress] = init();
  if (!profiles[targetAddress]) profiles[targetAddress] = init();

  const my = profiles[myAddress];
  const target = profiles[targetAddress];
  if (!my.following) my.following = [];
  if (!target.followers) target.followers = [];

  if (my.following.includes(targetAddress)) {
    my.following = my.following.filter(a => a !== targetAddress);
    target.followers = target.followers.filter(a => a !== myAddress);
  } else {
    my.following.push(targetAddress);
    target.followers.push(myAddress);
  }

  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  return { my, target };
};
