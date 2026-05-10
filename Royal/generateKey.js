/**
 * generateKey.js
 * Run once: node generateKey.js
 * Creates casino-keypair.json in the current directory.
 * KEEP THIS FILE SECRET — never commit casino-keypair.json to version control.
 */
'use strict';
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'casino-keypair.json');

if (fs.existsSync(FILE)) {
    const kp = require(FILE);
    const existing = Keypair.fromSecretKey(Uint8Array.from(kp.secretKey));
    console.log('⚠️  casino-keypair.json already exists.');
    console.log('   Public Key:', existing.publicKey.toBase58());
    console.log('   Delete the file and re-run if you need a new wallet.');
    process.exit(0);
}

const kp = Keypair.generate();
fs.writeFileSync(FILE, JSON.stringify({ secretKey: Array.from(kp.secretKey) }, null, 2));

console.log('✅ casino-keypair.json created!');
console.log('   Public Key :', kp.publicKey.toBase58());
console.log('   ⚠  Fund this wallet with SOL (for tx fees) and QHUBX (for prize payouts) before going live.');
console.log('   ⚠  Add casino-keypair.json to .gitignore immediately.');