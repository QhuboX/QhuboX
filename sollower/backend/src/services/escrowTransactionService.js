// backend/src/services/escrowTransactionService.js
const { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createTransferInstruction } = require('@solana/spl-token');
const bs58 = require('bs58');

class EscrowTransactionService {
  constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
    const pk = process.env.PLATFORM_PRIVATE_KEY;
    if (!pk) throw new Error('PLATFORM_PRIVATE_KEY not set');
    this.platformWallet = Keypair.fromSecretKey(bs58.decode(pk));
    this.tokenMint = new PublicKey(process.env.TOKEN_MINT_ADDRESS);
    this.tokenDecimals = parseInt(process.env.TOKEN_DECIMALS || '9');
  }

  toRaw(amount) { return Math.floor(amount * Math.pow(10, this.tokenDecimals)); }
  fromRaw(units) { return units / Math.pow(10, this.tokenDecimals); }

  async getOrCreateATA(owner) {
    return getOrCreateAssociatedTokenAccount(this.connection, this.platformWallet, this.tokenMint, owner);
  }

  async sendAdRewardFromEscrow(recipientPublicKey, amount, adId) {
    const recipient = new PublicKey(recipientPublicKey);
    const recipientATA = await this.getOrCreateATA(recipient);
    const platformATA = await this.getOrCreateATA(this.platformWallet.publicKey);

    const tx = new Transaction().add(
      createTransferInstruction(platformATA.address, recipientATA.address,
        this.platformWallet.publicKey, this.toRaw(amount), [], TOKEN_PROGRAM_ID)
    );
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.platformWallet.publicKey;

    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.platformWallet], { commitment: 'confirmed' });
    return { success: true, signature: sig, amount, recipient: recipientPublicKey };
  }

  async verifyEscrowDeposit(signature, expectedAmount) {
    try {
      const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
      if (!tx?.meta || tx.meta.err) return { success: false, error: 'Tx failed or not found' };

      const platformTransfer = tx.meta.postTokenBalances?.find(
        b => b.mint === this.tokenMint.toString() && b.owner === this.platformWallet.publicKey.toString()
      );
      if (!platformTransfer) return { success: false, error: 'No transfer to escrow' };

      const received = this.fromRaw(parseInt(platformTransfer.uiTokenAmount.amount));
      if (received >= expectedAmount) return { success: true, signature, amount: received };
      return { success: false, error: `Insufficient: expected ${expectedAmount}, got ${received}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getEscrowBalance() {
    const ata = await this.getOrCreateATA(this.platformWallet.publicKey);
    return { success: true, balance: this.fromRaw(parseInt(ata.amount.toString())), address: this.platformWallet.publicKey.toString() };
  }

  async getUserBalance(userPublicKey) {
    try {
      const ata = await this.getOrCreateATA(new PublicKey(userPublicKey));
      return { success: true, balance: this.fromRaw(parseInt(ata.amount.toString())), address: userPublicKey };
    } catch (e) {
      return { success: false, balance: 0, error: e.message };
    }
  }
}

let instance = null;
function getEscrowService() {
  if (!instance) instance = new EscrowTransactionService();
  return instance;
}
module.exports = { getEscrowService, EscrowTransactionService };
