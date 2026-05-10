import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import bs58 from 'bs58';
import {
  Connection,
  PublicKey,
  Keypair,
  AddressLookupTableAccount,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction
} from '@solana/web3.js';

dotenv.config();

const SERVER_BASE = process.env.PROXY_SERVER_URL || 'http://localhost:3003';
const SOLANA_RPC = process.env.VITE_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const QUOTE_FILE = path.resolve(process.cwd(), '..', 'quote.json');
const KEYPAIR_FILE = path.resolve(process.cwd(), 'server', 'keypair.json');
const BUILD_FILE = path.resolve(process.cwd(), 'server', 'build-response.json');
const SIGNED_FILE = path.resolve(process.cwd(), 'server', 'signed.json');
const EXECUTE_FILE = path.resolve(process.cwd(), 'server', 'execute-response.json');

function ensureFileExists(filePath, name) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${name} no encontrado en ${filePath}`);
  }
}

function toTxInstruction(raw) {
  const programId = new PublicKey(raw.programId);
  const keys = (raw.accounts || []).map((a) => ({
    pubkey: new PublicKey(a.pubkey),
    isSigner: !!a.isSigner,
    isWritable: !!a.isWritable
  }));
  const data = raw.data ? Buffer.from(raw.data, 'base64') : Buffer.alloc(0);
  return new TransactionInstruction({ programId, keys, data });
}

function collectInstructions(buildResp) {
  const instructions = [];
  if (Array.isArray(buildResp.computeBudgetInstructions)) {
    buildResp.computeBudgetInstructions.forEach((i) => instructions.push(toTxInstruction(i)));
  }
  if (Array.isArray(buildResp.setupInstructions)) {
    buildResp.setupInstructions.forEach((i) => instructions.push(toTxInstruction(i)));
  }
  if (buildResp.swapInstruction) {
    instructions.push(toTxInstruction(buildResp.swapInstruction));
  }
  if (buildResp.cleanupInstruction) {
    instructions.push(toTxInstruction(buildResp.cleanupInstruction));
  }
  if (Array.isArray(buildResp.otherInstructions)) {
    buildResp.otherInstructions.forEach((i) => instructions.push(toTxInstruction(i)));
  }
  return instructions;
}

(async function main() {
  try {
    console.log('--- START build-sign-execute ---');
    ensureFileExists(QUOTE_FILE, 'quote.json');
    ensureFileExists(KEYPAIR_FILE, 'server/keypair.json');

    const quotePayload = JSON.parse(fs.readFileSync(QUOTE_FILE, 'utf8'));
    console.log('0) Enviando quote al proxy para order y requestId...');

    const orderRes = await fetch(`${SERVER_BASE}/api/jupiter/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quotePayload),
      timeout: 60000
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error(`Order request falló: ${orderRes.status} ${orderRes.statusText} - ${JSON.stringify(orderData)}`);
    }

    const requestId = orderData.requestId || orderData.data?.requestId || quotePayload.requestId;
    if (!requestId) {
      throw new Error('No se pudo obtener requestId de /api/jupiter/order o quote.json');
    }

    console.log('1) Order exitosa, requestId=', requestId);
    console.log('2) Enviando build al proxy...');

    const buildRes = await fetch(`${SERVER_BASE}/api/jupiter/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quotePayload),
      timeout: 60000
    });

    const buildData = await buildRes.json();
    if (!buildRes.ok) {
      throw new Error(`Build request falló: ${buildRes.status} ${buildRes.statusText} - ${JSON.stringify(buildData)}`);
    }

    fs.writeFileSync(BUILD_FILE, JSON.stringify(buildData, null, 2), { encoding: 'utf8', mode: 0o600 });
    console.log('1) Build completado y guardado en', BUILD_FILE);

    const keypairRaw = JSON.parse(fs.readFileSync(KEYPAIR_FILE, 'utf8'));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairRaw.secret));

    const taker = buildData.taker || quotePayload.taker || keypair.publicKey.toString();
    const blockhashArray = buildData.blockhashWithMetadata?.blockhash;
    if (!blockhashArray || !Array.isArray(blockhashArray) || blockhashArray.length === 0) {
      throw new Error('No se encontró blockhashWithMetadata.blockhash en build-response.');
    }

    const recentBlockhash = bs58.encode(Buffer.from(blockhashArray));
    const instructions = collectInstructions(buildData);
    if (instructions.length === 0) {
      throw new Error('No se encontraron instrucciones para construir la transacción.');
    }

    console.log(`2) Preparando transacción (payer=${taker}) con ${instructions.length} instrucciones`);
    const connection = new Connection(SOLANA_RPC, 'confirmed');

    const lookupTablePubkeys = Object.keys(buildData.addressesByLookupTableAddress || {});
    const lookupTableAccounts = [];
    for (const lut of lookupTablePubkeys) {
      const accountInfo = await connection.getAddressLookupTable(new PublicKey(lut));
      if (!accountInfo.value) {
        throw new Error(`No se pudo recuperar AddressLookupTable ${lut}.`);
      }
      lookupTableAccounts.push(accountInfo.value);
      console.log('   - lookup table cargada:', lut);
    }

    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(taker),
      recentBlockhash,
      instructions
    }).compileToV0Message(lookupTableAccounts);

    const tx = new VersionedTransaction(messageV0);
    tx.sign([keypair]);
    const signedBase64 = Buffer.from(tx.serialize()).toString('base64');

    const signedPayload = {
      signedTransaction: signedBase64,
      userPublicKey: keypair.publicKey.toString(),
      requestId: requestId
    };

    fs.writeFileSync(SIGNED_FILE, JSON.stringify(signedPayload, null, 2), { encoding: 'utf8', mode: 0o600 });
    console.log('2) Transacción firmada guardada en', SIGNED_FILE);

    console.log('3) Ejecutando transacción con el endpoint /api/jupiter/execute (execute)...');
    const executeRes = await fetch(`${SERVER_BASE}/api/jupiter/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedPayload),
      timeout: 60000
    });
    const executeData = await executeRes.json();

    fs.writeFileSync(EXECUTE_FILE, JSON.stringify({ status: executeRes.status, body: executeData }, null, 2), { encoding: 'utf8', mode: 0o600 });

    if (!executeRes.ok) {
      throw new Error(`Execute request falló: ${executeRes.status} ${executeRes.statusText} - ${JSON.stringify(executeData)}`);
    }

    console.log('3) Execute completado y guardado en', EXECUTE_FILE);
    console.log('--- FIN build-sign-execute: Éxito total ---');
    console.log('response', executeData);

  } catch (err) {
    console.error('Error en build-sign-execute:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
