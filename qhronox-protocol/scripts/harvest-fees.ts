#!/usr/bin/env ts-node
/**
 * QhronoX Protocol — Fee Harvester & Distributor
 * Cron script (hourly): collects withheld 3% fees and distributes to QvaultX.
 *
 * Run: npx ts-node scripts/harvest-fees.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  harvestWithheldTokensToMint,
  withdrawWithheldTokensFromMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  getMint,
} from "@solana/spl-token";
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

  const feeAuthority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(
      fs.readFileSync(path.resolve(process.env.HOME!, ".config/solana/id.json"), "utf-8")
    ))
  );

  const wallet   = new anchor.Wallet(feeAuthority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program      = new Program<QhronoXStaking>(IDL, provider);
  const mintPubkey   = new PublicKey(deployment.mintAddress);
  const poolPubkey   = new PublicKey(deployment.poolAddress);
  const vaultPubkey  = new PublicKey(deployment.vaultAddress);

  console.log("QhronoX Protocol — Fee Harvester starting:", new Date().toISOString());

  // Step 1: Find all QHUBX token accounts with withheld fees
  const accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    filters: [{ dataSize: 182 }],
  });
  console.log(`Found ${accounts.length} QHUBX token accounts.`);

  if (accounts.length === 0) { console.log("Nothing to harvest."); return; }

  // Step 2: Harvest withheld fees to mint
  await harvestWithheldTokensToMint(
    connection, feeAuthority, mintPubkey,
    accounts.map((a) => a.pubkey),
    { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
  );
  console.log("Harvested fees to mint.");

  // Step 3: Withdraw to fee collector ATA
  const feeCollectorATA = await getOrCreateAssociatedTokenAccount(
    connection, feeAuthority, mintPubkey, feeAuthority.publicKey,
    false, "confirmed", {}, TOKEN_2022_PROGRAM_ID
  );

  await withdrawWithheldTokensFromMint(
    connection, feeAuthority, mintPubkey,
    feeCollectorATA.address, feeAuthority,
    [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
  );

  const feeBalance = (
    await getAccount(connection, feeCollectorATA.address, "confirmed", TOKEN_2022_PROGRAM_ID)
  ).amount;

  if (feeBalance === BigInt(0)) { console.log("No fees collected yet."); return; }

  const mintInfo = await getMint(connection, mintPubkey, "confirmed", TOKEN_2022_PROGRAM_ID);
  const stakersAmt  = (feeBalance * BigInt(70)) / BigInt(100);
  const treasuryAmt = (feeBalance * BigInt(20)) / BigInt(100);
  const burnAmt     = feeBalance - stakersAmt - treasuryAmt;

  console.log(`Distributing ${feeBalance} raw QHUBX:`);
  console.log(`  → QvaultX (stakers 70%): ${stakersAmt}`);
  console.log(`  → Treasury (20%):        ${treasuryAmt}`);
  console.log(`  → Burn (10%):            ${burnAmt}`);

  // Step 4: Deposit into QvaultX and update reward accumulator
  await program.methods
    .depositFees(new anchor.BN(feeBalance.toString()))
    .accounts({
      feeAuthority:  feeAuthority.publicKey,
      mint:          mintPubkey,
      pool:          poolPubkey,
      vault:         vaultPubkey,
      feeSource:     feeCollectorATA.address,
      tokenProgram:  TOKEN_2022_PROGRAM_ID,
    })
    .signers([feeAuthority])
    .rpc();

  console.log("✓ Fees deposited into QvaultX. Reward accumulator updated.");
  console.log("QhronoX Protocol — Harvest complete:", new Date().toISOString());
}

main().catch((e) => { console.error(e); process.exit(1); });
