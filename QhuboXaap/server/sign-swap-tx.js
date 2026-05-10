// sign-swap-tx.js
import { VersionedTransaction, Keypair } from '@solana/web3.js';
import { Buffer } from 'buffer';
window.Buffer = Buffer; // si es navegador

// swapTxBase64: copia el swapTransaction que devolvió build-response.json
const swapTxBase64 = '<PEGA_SWAP_TRANSACTION_BASE64_AQUI>';

// Cargar keypair (ejemplo: desde secret array)
const secretArray = [ /* 64 números 0-255 del secretKey */ ];
const keypair = Keypair.fromSecretKey(Uint8Array.from(secretArray));

// Deserializar
const txBuf = Buffer.from(swapTxBase64, 'base64');
const transaction = VersionedTransaction.deserialize(txBuf);

// Firmar con tu keypair
transaction.sign([keypair]);

// Serializar y convertir a base64
const signedBase64 = Buffer.from(transaction.serialize()).toString('base64');
console.log('SIGNED_BASE64:', signedBase64);
console.log('USER_PUBKEY:', keypair.publicKey.toString());
