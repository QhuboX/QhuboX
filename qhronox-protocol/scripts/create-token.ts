#!/usr/bin/env ts-node
/**
 * QhronoX Protocol — QHUBX Token Creation Script
 * Creates the QHUBX token (Token-2022) with a 3% (300 bps) transfer fee.
 *
 * Run:
 *   npx ts-node scripts/create-token.ts --cluster devnet
 *   npx ts-node scripts/create-token.ts --cluster mainnet-beta
 */

import {
  Connection, Keypair, SystemProgram, Transaction,
  sendAndConfirmTransaction, clusterApiUrl,
} from "@solana/web3.js";
import {
  ExtensionType, TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  getMintLen, getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DECIMALS        = 6;
const TRANSFER_FEE_BPS = 300;                                    // 3%
const MAX_FEE          = BigInt(1_000_000_000_000);              // uncapped
const TOTAL_SUPPLY     = BigInt(1_000_000_000) * BigInt(10 ** DECIMALS); // 1B QHUBX

async function main() {
  const cluster = process.argv.includes("--cluster")
    ? process.argv[process.argv.indexOf("--cluster") + 1]
    : "devnet";

  const rpcUrl = cluster === "mainnet-beta"
    ? process.env.HELIUS_RPC_URL!
    : clusterApiUrl("devnet");

  const connection = new Connection(rpcUrl, "confirmed");

  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(
      fs.readFileSync(path.resolve(process.env.HOME!, ".config/solana/id.json"), "utf-8")
    ))
  );

  const mintKeypair = Keypair.generate();
  console.log("QHUBX Mint address:", mintKeypair.publicKey.toBase58());

  const feeWithdrawAuthority = payerKeypair.publicKey;

  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen    = getMintLen(extensions);
  const lamports   = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey:         payerKeypair.publicKey,
      newAccountPubkey:   mintKeypair.publicKey,
      space:              mintLen,
      lamports,
      programId:          TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      payerKeypair.publicKey,   // config authority
      feeWithdrawAuthority,
      TRANSFER_FEE_BPS,
      MAX_FEE,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey, DECIMALS,
      payerKeypair.publicKey, null, TOKEN_2022_PROGRAM_ID
    )
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [payerKeypair, mintKeypair]);
  console.log("QHUBX mint created. Tx:", sig);

  const deployerATA = await getOrCreateAssociatedTokenAccount(
    connection, payerKeypair, mintKeypair.publicKey, payerKeypair.publicKey,
    false, "confirmed", {}, TOKEN_2022_PROGRAM_ID
  );

  const mintSig = await mintTo(
    connection, payerKeypair, mintKeypair.publicKey,
    deployerATA.address, payerKeypair, TOTAL_SUPPLY,
    [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
  );
  console.log("Minted 1,000,000,000 QHUBX. Tx:", mintSig);

  const deployment = {
    protocol:          "QhronoX Protocol",
    cluster,
    mintAddress:       mintKeypair.publicKey.toBase58(),
    mintSecretKey:     Array.from(mintKeypair.secretKey),
    deployerAddress:   payerKeypair.publicKey.toBase58(),
    deployerATA:       deployerATA.address.toBase58(),
    transferFeeBps:    TRANSFER_FEE_BPS,
    decimals:          DECIMALS,
    totalSupply:       TOTAL_SUPPLY.toString(),
    tokenSymbol:       "QHUBX",
    deployedAt:        new Date().toISOString(),
  };

  const outPath = path.resolve(__dirname, "../deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("\nDeployment info saved to:", outPath);
  console.log("\nNEXT STEPS:");
  console.log("1. anchor build && anchor deploy");
  console.log("2. npx ts-node scripts/initialize-pool.ts");
  console.log("3. Update app/.env.local with NEXT_PUBLIC_MINT_ADDRESS =", mintKeypair.publicKey.toBase58());
}

main().catch((e) => { console.error(e); process.exit(1); });
