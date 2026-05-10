const { Keypair } = require('@solana/web3.js');

const wallet = Keypair.generate();

console.log("Public Key:", wallet.publicKey.toBase58());
console.log("Secret Key:", wallet.secretKey);
