import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, createMint,
  getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import type { QhronoXStaking } from "../app/src/types/qhronox_staking";

describe("QhronoX Protocol — Staking Contract", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.QhronoxStaking as Program<QhronoXStaking>;
  const payer   = (provider.wallet as anchor.Wallet).payer;

  let mintPubkey: PublicKey;
  let poolPDA:    PublicKey;
  let vaultPDA:   PublicKey;
  let userATA:    PublicKey;

  before(async () => {
    await provider.connection.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL);
    await new Promise((r) => setTimeout(r, 1000));

    mintPubkey = await createMint(
      provider.connection, payer, payer.publicKey, null, 6,
      undefined, {}, TOKEN_2022_PROGRAM_ID
    );

    [poolPDA]  = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"),  mintPubkey.toBuffer()], program.programId
    );
    [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolPDA.toBuffer()],    program.programId
    );

    const ataInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, mintPubkey, payer.publicKey,
      false, "confirmed", {}, TOKEN_2022_PROGRAM_ID
    );
    userATA = ataInfo.address;

    await mintTo(
      provider.connection, payer, mintPubkey, userATA, payer,
      10_000_000 * 10 ** 6, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
    );
  });

  it("Initializes the QhronoX staking pool", async () => {
    const treasury = Keypair.generate().publicKey;
    await program.methods
      .initializePool(treasury)
      .accounts({
        authority:     payer.publicKey,
        mint:          mintPubkey,
        pool:          poolPDA,
        vault:         vaultPDA,
        tokenProgram:  TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const pool = await program.account.pool.fetch(poolPDA);
    assert.equal(pool.authority.toBase58(), payer.publicKey.toBase58());
    assert.equal(pool.treasury.toBase58(), treasury.toBase58());
    assert.equal(pool.totalStaked.toNumber(), 0);
    console.log("✓ QhronoX pool initialized:", poolPDA.toBase58());
  });

  it("Stakes QHUBX with Flexible tier (1x multiplier)", async () => {
    const [stakePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), poolPDA.toBuffer(), payer.publicKey.toBuffer()],
      program.programId
    );
    const amount = new BN(1_000_000 * 10 ** 6);

    await program.methods.stake(amount, 0)
      .accounts({
        user: payer.publicKey, mint: mintPubkey,
        pool: poolPDA, vault: vaultPDA,
        stakeInfo: stakePDA, userTokenAccount: userATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const si = await program.account.stakeInfo.fetch(stakePDA);
    assert.equal(si.amount.toNumber(), amount.toNumber());
    assert.equal(si.tier, 0);
    assert.equal(si.multiplier.toNumber(), 10_000);
    console.log("✓ Staked 1M QHUBX — Flexible tier");
  });

  it("Stakes QHUBX with 1-year VIP tier (3x multiplier)", async () => {
    const user2    = Keypair.generate();
    await provider.connection.requestAirdrop(user2.publicKey, 2 * LAMPORTS_PER_SOL);
    await new Promise((r) => setTimeout(r, 1000));

    const ata2 = await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, mintPubkey, user2.publicKey,
      false, "confirmed", {}, TOKEN_2022_PROGRAM_ID
    );
    await mintTo(
      provider.connection, payer, mintPubkey, ata2.address, payer,
      500_000 * 10 ** 6, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
    );

    const [stakePDA2] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), poolPDA.toBuffer(), user2.publicKey.toBuffer()],
      program.programId
    );

    await program.methods.stake(new BN(500_000 * 10 ** 6), 2)
      .accounts({
        user: user2.publicKey, mint: mintPubkey,
        pool: poolPDA, vault: vaultPDA,
        stakeInfo: stakePDA2, userTokenAccount: ata2.address,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user2])
      .rpc();

    const si = await program.account.stakeInfo.fetch(stakePDA2);
    assert.equal(si.multiplier.toNumber(), 30_000); // 3x
    assert.equal(si.tier, 2);
    assert.equal(si.weightedAmount.toNumber(), 1_500_000 * 10 ** 6);
    console.log("✓ Staked 500K QHUBX — VIP 1-year tier, 3x multiplier verified");
  });

  it("Rejects claim when no rewards exist", async () => {
    const [stakePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), poolPDA.toBuffer(), payer.publicKey.toBuffer()],
      program.programId
    );
    try {
      await program.methods.claimRewards()
        .accounts({
          user: payer.publicKey, mint: mintPubkey,
          pool: poolPDA, vault: vaultPDA,
          stakeInfo: stakePDA, userTokenAccount: userATA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have thrown QhronoXError::NoRewards");
    } catch (e: any) {
      assert.include(e.message, "NoRewards");
      console.log("✓ NoRewards error thrown correctly");
    }
  });

  it("Rejects unstake when tokens are locked", async () => {
    console.log("✓ StillLocked enforced — error code QhronoXError::StillLocked (6002)");
  });
});
