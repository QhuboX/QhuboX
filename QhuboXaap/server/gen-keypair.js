// gen-keypair.js (Node)
import fs from 'fs';
import { Keypair } from '@solana/web3.js';

const kp = Keypair.generate();
const secret = Array.from(kp.secretKey); // array de bytes
fs.writeFileSync('keypair.json', JSON.stringify({ secret }), { encoding: 'utf8', mode: 0o600 });
console.log('PublicKey:', kp.publicKey.toString());
