// backend/src/lib/solanaVerifier.js
const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

async function fetchQhubxPrice(mintAddress) {
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${mintAddress}`);
    const data = await res.json();
    return parseFloat(data?.data?.[mintAddress]?.price ?? 0) || null;
  } catch { return null; }
}

async function verifySolanaPayment(txHash, buyerAddress, expectedPriceUSD) {
  try {
    const sellerAddr = process.env.SELLER_WALLET_ADDRESS;
    const mintAddr = process.env.TOKEN_MINT_ADDRESS;
    const decimals = parseInt(process.env.TOKEN_DECIMALS || '9');

    if (!sellerAddr || !mintAddr) {
      console.error('Missing SELLER_WALLET_ADDRESS or TOKEN_MINT_ADDRESS');
      return false;
    }

    const pricePerToken = await fetchQhubxPrice(mintAddr);
    if (!pricePerToken) { console.error('Token price unavailable'); return false; }

    const expectedTokens = expectedPriceUSD / pricePerToken;
    const expectedRaw = BigInt(Math.floor(expectedTokens * Math.pow(10, decimals)));
    const tolerance = expectedRaw / 100n; // 1%

    const tx = await connection.getParsedTransaction(txHash, { maxSupportedTransactionVersion: 0 });
    if (!tx?.meta || tx.meta.err) return false;

    const sellerBalance = tx.meta.postTokenBalances?.find(
      b => b.mint === mintAddr && b.owner === sellerAddr
    );
    if (!sellerBalance) return false;

    const received = BigInt(sellerBalance.uiTokenAmount.amount);
    return received >= expectedRaw - tolerance;
  } catch (e) {
    console.error('verifySolanaPayment error:', e.message);
    return false;
  }
}

module.exports = { verifySolanaPayment };
