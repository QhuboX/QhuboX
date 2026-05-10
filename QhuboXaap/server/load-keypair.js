// load-keypair.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Keypair } from '@solana/web3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keypairPath = path.resolve(__dirname, 'keypair.json');

if (!fs.existsSync(keypairPath)) {
  throw new Error(`keypair.json no encontrado en ${keypairPath}`);
}

const raw = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
const secret = Uint8Array.from(raw.secret);
export const KEYPAIR = Keypair.fromSecretKey(secret);
console.log('Loaded public key', KEYPAIR.publicKey.toString());
