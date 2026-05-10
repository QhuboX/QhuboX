// server/sign-and-create-signed-json.js
import fs from 'fs';
import path from 'path';
import { Keypair, VersionedTransaction, Connection, PublicKey, AddressLookupTableAccount, TransactionInstruction, TransactionMessage } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';

globalThis.Buffer = Buffer;

const baseDir = path.resolve('server');
const keypairPath = path.join(baseDir, 'keypair.json');
const buildRespPath = path.join(baseDir, 'build-response.json');
const outSignedPath = path.join(baseDir, 'signed.json');

if (!fs.existsSync(keypairPath)) {
    console.error('No se encontró keypair.json en', keypairPath);
    process.exit(1);
}
if (!fs.existsSync(buildRespPath)) {
    console.error('No se encontró build-response.json en', buildRespPath);
    process.exit(1);
}

const rawKey = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
const secret = Uint8Array.from(rawKey.secret);
const keypair = Keypair.fromSecretKey(secret);

const buildResp = JSON.parse(fs.readFileSync(buildRespPath, 'utf8'));
const swapTxBase64 = buildResp.swapTransaction || (buildResp.data && buildResp.data.swapTransaction);

function instructionFromObject(raw) {
    return new TransactionInstruction({
        programId: new PublicKey(raw.programId),
        keys: (raw.accounts || []).map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: !!a.isSigner, isWritable: !!a.isWritable })),
        data: raw.data ? Buffer.from(raw.data, 'base64') : Buffer.alloc(0)
    });
}

async function buildAndSignFromInstructions() {
    const connection = new Connection(process.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
    const blockhashArr = buildResp.blockhashWithMetadata?.blockhash;
    if (!blockhashArr) throw new Error('No blockhashWithMetadata.blockhash presente.');
    const recentBlockhash = bs58.encode(Buffer.from(blockhashArr));
    const payerKey = buildResp.taker || keypair.publicKey.toString();

    const instructions = [];
    ['computeBudgetInstructions', 'setupInstructions', 'swapInstruction', 'cleanupInstruction', 'otherInstructions'].forEach((k) => {
        const item = buildResp[k];
        if (Array.isArray(item)) {
            item.forEach((i) => instructions.push(instructionFromObject(i)));
        } else if (item) {
            instructions.push(instructionFromObject(item));
        }
    });

    if (instructions.length === 0) {
        throw new Error('No se encontraron instrucciones para construir la transacción.');
    }

    const lookupTableAccounts = [];
    const lutMap = buildResp.addressesByLookupTableAddress || {};
    for (const lutKey of Object.keys(lutMap)) {
        const lutAccountInfo = await connection.getAddressLookupTable(new PublicKey(lutKey));
        if (!lutAccountInfo.value) throw new Error(`No se pudo obtener AddressLookupTable ${lutKey}`);
        lookupTableAccounts.push(lutAccountInfo.value);
    }

    const messageV0 = new TransactionMessage({
        payerKey: new PublicKey(payerKey),
        recentBlockhash,
        instructions
    }).compileToV0Message(lookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([keypair]);

    const signedBase64 = Buffer.from(transaction.serialize()).toString('base64');
    const signedObj = { signedTransaction: signedBase64, userPublicKey: payerKey, requestId: buildResp.requestId || null };
    fs.writeFileSync(outSignedPath, JSON.stringify(signedObj, null, 2), { encoding: 'utf8', mode: 0o600 });
    console.log('signed.json creado en', outSignedPath);
    console.log('userPublicKey:', signedObj.userPublicKey);
}

(async () => {
    try {
        if (swapTxBase64) {
            const txBuf = Buffer.from(swapTxBase64, 'base64');
            const transaction = VersionedTransaction.deserialize(txBuf);
            transaction.sign([keypair]);
            const signedBase64 = Buffer.from(transaction.serialize()).toString('base64');
            const signedObj = { signedTransaction: signedBase64, userPublicKey: keypair.publicKey.toString(), requestId: buildResp.requestId || null };
            fs.writeFileSync(outSignedPath, JSON.stringify(signedObj, null, 2), { encoding: 'utf8', mode: 0o600 });
            console.log('signed.json creado en', outSignedPath);
            console.log('userPublicKey:', signedObj.userPublicKey);
            process.exit(0);
        }

        await buildAndSignFromInstructions();
        process.exit(0);
    } catch (err) {
        console.error('Error al firmar la transacción:', err && err.message ? err.message : err);
        process.exit(1);
    }
})();
