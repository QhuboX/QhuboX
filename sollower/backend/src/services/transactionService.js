// backend/src/services/transactionService.js
const { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createTransferInstruction } = require('@solana/spl-token');
const bs58 = require('bs58');

// ── Token price helper (server-side) ────────────────────────────
async function fetchQhubxPriceUSD(mintAddress) {
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${mintAddress}`);
    const data = await res.json();
    return parseFloat(data?.data?.[mintAddress]?.price ?? 0) || null;
  } catch { return null; }
}

async function usdToTokenUnits(usdAmount, mintAddress, decimals) {
  const pricePerToken = await fetchQhubxPriceUSD(mintAddress);
  if (!pricePerToken) throw new Error('Token price unavailable');
  const tokens = usdAmount / pricePerToken;
  return Math.floor(tokens * Math.pow(10, decimals));
}

class TransactionService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed'
    );

    const pk = process.env.PLATFORM_PRIVATE_KEY;
    if (!pk) throw new Error('PLATFORM_PRIVATE_KEY not set');
    this.platformWallet = Keypair.fromSecretKey(bs58.decode(pk));
    console.log('✅ Platform wallet:', this.platformWallet.publicKey.toString());

    this.tokenMint = new PublicKey(process.env.TOKEN_MINT_ADDRESS);
    this.tokenDecimals = parseInt(process.env.TOKEN_DECIMALS || '9');
    this.fees = {
      personal: parseFloat(process.env.PUBLICATION_FEE_PERSONAL || '0'),
      sale: parseFloat(process.env.PUBLICATION_FEE_SALE || '10'),
      fund: parseFloat(process.env.PUBLICATION_FEE_FUNDRAISING || '10'),
      ad: parseFloat(process.env.PUBLICATION_FEE_AD || '10'),
    };
  }

  toRawUnits(amount) { return Math.floor(amount * Math.pow(10, this.tokenDecimals)); }
  fromRawUnits(units) { return units / Math.pow(10, this.tokenDecimals); }

  async getOrCreateATA(owner) {
    return getOrCreateAssociatedTokenAccount(
      this.connection, this.platformWallet, this.tokenMint, owner
    );
  }

  /**
   * Send ad reward from platform escrow to viewer (USD amount converted to QHUBX)
   */
  async sendAdReward(recipientPublicKey, usdAmount, adId) {
    console.log(`🎁 Sending $${usdAmount} reward to ${recipientPublicKey} for ad ${adId}`);
    const recipient = new PublicKey(recipientPublicKey);
    const rawAmount = await usdToTokenUnits(usdAmount, this.tokenMint.toString(), this.tokenDecimals);

    const recipientATA = await this.getOrCreateATA(recipient);
    const platformATA = await this.getOrCreateATA(this.platformWallet.publicKey);

    const tx = new Transaction().add(
      createTransferInstruction(platformATA.address, recipientATA.address,
        this.platformWallet.publicKey, rawAmount, [], TOKEN_PROGRAM_ID)
    );
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.platformWallet.publicKey;

    const signature = await sendAndConfirmTransaction(this.connection, tx, [this.platformWallet], { commitment: 'confirmed', maxRetries: 3 });
    console.log('✅ Reward sent:', signature);
    return { success: true, signature, usdAmount, recipient: recipientPublicKey };
  }

  /**
   * Verify a payment transaction on-chain
   */
  async verifyPayment(signature, expectedUSD, expectedRecipient) {
    const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx?.meta || tx.meta.err) return { success: false, error: 'Transaction not found or failed' };

    const pricePerToken = await fetchQhubxPriceUSD(this.tokenMint.toString());
    if (!pricePerToken) return { success: false, error: 'Token price unavailable' };

    const expectedTokens = expectedUSD / pricePerToken;
    const expectedRaw = Math.floor(expectedTokens * Math.pow(10, this.tokenDecimals));
    const tolerance = Math.floor(expectedRaw * 0.01); // 1% tolerance

    const recipientBalance = tx.meta.postTokenBalances?.find(b => b.owner === expectedRecipient);
    if (!recipientBalance) return { success: false, error: 'No transfer to expected recipient' };

    const received = parseInt(recipientBalance.uiTokenAmount.amount);
    if (received >= expectedRaw - tolerance) {
      return { success: true, signature, usdAmount: expectedUSD };
    }
    return { success: false, error: `Insufficient: expected ~${expectedRaw}, got ${received}` };
  }

  async getPlatformBalance() {
    const ata = await this.getOrCreateATA(this.platformWallet.publicKey);
    const balance = this.fromRawUnits(parseInt(ata.amount.toString()));
    return { success: true, balance, address: this.platformWallet.publicKey.toString() };
  }

  async getUserBalance(userPublicKey) {
    try {
      const ata = await this.getOrCreateATA(new PublicKey(userPublicKey));
      return { success: true, balance: this.fromRawUnits(parseInt(ata.amount.toString())), address: userPublicKey };
    } catch (e) {
      return { success: false, balance: 0, error: e.message };
    }
  }
}

let instance = null;
function getTransactionService() {
  if (!instance) instance = new TransactionService();
  return instance;
}
module.exports = { getTransactionService, TransactionService };
