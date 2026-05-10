#!/usr/bin/env ts-node
/**
 * QhronoX Protocol — Initialize Staking Pool
 * Run ONCE after `anchor deploy`.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

import type { QhronoXStaking } from "../app/src/types/qhronox_staking";
const IDL = require("../target/idl/qhronox_staking.json");

async function main() {
  const deployment = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../deployment.json"), "utf-8")
  );

  const connection = new Connection(
    process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com", "confirmed"
  );

  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(
      fs.readFileSync(path.resolve(process.env.HOME!, ".config/solana/id.json"), "utf-8")
    ))
  );

  const wallet   = new anchor.Wallet(payerKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program    = new Program<QhronoXStaking>(IDL, provider);
  const mintPubkey = new PublicKey(deployment.mintAddress);

  const [poolPDA]  = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"),  mintPubkey.toBuffer()], program.programId
  );
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolPDA.toBuffer()], program.programId
  );

  const treasury = payerKeypair.publicKey; // TODO: replace with multisig

  console.log("QhronoX Protocol — Initializing pool");
  console.log("Pool PDA  :", poolPDA.toBase58());
  console.log("QvaultX   :", vaultPDA.toBase58());

  const tx = await program.methods
    .initializePool(treasury)
    .accounts({
      authority:     payerKeypair.publicKey,
      mint:          mintPubkey,
      pool:          poolPDA,
      vault:         vaultPDA,
      tokenProgram:  TOKEN_2022_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([payerKeypair])
    .rpc();

  console.log("Pool initialized. Tx:", tx);

  deployment.poolAddress    = poolPDA.toBase58();
  deployment.vaultAddress   = vaultPDA.toBase58();
  deployment.treasuryAddress = treasury.toBase58();
  fs.writeFileSync(
    path.resolve(__dirname, "../deployment.json"),
    JSON.stringify(deployment, null, 2)
  );

  console.log("\nAdd to app/.env.local:");
  console.log(`NEXT_PUBLIC_MINT_ADDRESS=${mintPubkey.toBase58()}`);
  console.log(`NEXT_PUBLIC_POOL_ADDRESS=${poolPDA.toBase58()}`);
  console.log(`NEXT_PUBLIC_VAULT_ADDRESS=${vaultPDA.toBase58()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
