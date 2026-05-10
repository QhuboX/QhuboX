"use client";
/**
 * QhronoX Protocol — useStaking hook
 * All on-chain interactions: read pool state, stake, unstake, claim rewards.
 */

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import type { QhronoXStaking } from "@/types/qhronox_staking";
import IDL from "@/lib/qhronox_staking.json";

const MINT_ADDRESS = new PublicKey(process.env.NEXT_PUBLIC_MINT_ADDRESS!);
const POOL_ADDRESS = new PublicKey(process.env.NEXT_PUBLIC_POOL_ADDRESS!);
const PROGRAM_ID   = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);

export type LockTier = 0 | 1 | 2;

export interface PoolState {
  totalStaked: number;
  totalWeighted: number;
  accumulatedRewardsPerWeight: number;
  totalFeesCollected: number;
  totalBurned: number;
  authority: string;
  treasury: string;
}

export interface UserStakeState {
  amount: number;
  weightedAmount: number;
  multiplier: number;
  tier: LockTier;
  stakedAt: number;
  unlockAt: number;
  pendingRewards: number;
  totalClaimed: number;
  poolShare: number;
  pendingUsd: number;
}

export interface StakingHook {
  pool: PoolState | null;
  userStake: UserStakeState | null;
  userTokenBalance: number;
  qhubxPrice: number;
  loading: boolean;
  txPending: boolean;
  error: string | null;
  stake: (amount: number, tier: LockTier) => Promise<string>;
  unstake: (amount: number) => Promise<string>;
  claimRewards: () => Promise<string>;
  refresh: () => Promise<void>;
}

export function useStaking(): StakingHook {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [pool, setPool]                   = useState<PoolState | null>(null);
  const [userStake, setUserStake]         = useState<UserStakeState | null>(null);
  const [userTokenBalance, setBalance]    = useState(0);
  const [qhubxPrice, setQHUBXPrice]           = useState(0);
  const [loading, setLoading]             = useState(false);
  const [txPending, setTxPending]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const getProgram = useCallback(() => {
    if (!wallet.publicKey) return null;
    const provider = new anchor.AnchorProvider(connection, wallet as anchor.Wallet, {
      commitment: "confirmed",
    });
    if (!provider) return null;
try {
  return new Program(IDL as any, provider);
} catch (e) {
  console.error("Fallo al cargar el programa:", e);
  return null;
}
  }, [connection, wallet]);

  const fetchPrice = useCallback(async () => {
    try {
      const res  = await fetch(`https://price.jup.ag/v6/price?ids=${MINT_ADDRESS.toBase58()}`);
      const data = await res.json();
      const p    = data?.data?.[MINT_ADDRESS.toBase58()]?.price;
      if (p) setQHUBXPrice(p);
    } catch {}
  }, []);

  const fetchPool = useCallback(async (program: Program<QhronoXStaking>) => {
    const acc    = await program.account.pool.fetch(POOL_ADDRESS);
    const scale  = 1_000_000;
    return {
      totalStaked:                 acc.totalStaked.toNumber()  / scale,
      totalWeighted:               acc.totalWeighted.toNumber() / scale,
      accumulatedRewardsPerWeight: acc.accumulatedRewardsPerWeight.toNumber(),
      totalFeesCollected:          acc.totalFeesCollected.toNumber() / scale,
      totalBurned:                 acc.totalBurned.toNumber()  / scale,
      authority:                   acc.authority.toBase58(),
      treasury:                    acc.treasury.toBase58(),
    };
  }, []);

  const fetchUserStake = useCallback(
    async (program: Program<QhronoXStaking>, poolData: PoolState) => {
      if (!wallet.publicKey) return null;
      const [stakePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), POOL_ADDRESS.toBuffer(), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );
      try {
        const acc    = await program.account.stakeInfo.fetch(stakePDA);
        const scale  = 1_000_000;
        const amount = acc.amount.toNumber() / scale;
        const weighted = acc.weightedAmount.toNumber() / scale;

        const delta   = Math.max(0, poolData.accumulatedRewardsPerWeight - acc.rewardDebt.toNumber());
        const pending = (acc.weightedAmount.toNumber() * delta) / 1_000_000_000 / scale;
        const total   = acc.pendingRewards.toNumber() / scale + pending;

        const poolShare = poolData.totalWeighted > 0
          ? (weighted / poolData.totalWeighted) * 100 : 0;

        return {
          amount,
          weightedAmount: weighted,
          multiplier:  acc.multiplier.toNumber() / 10_000,
          tier:        acc.tier as LockTier,
          stakedAt:    acc.stakedAt.toNumber(),
          unlockAt:    acc.unlockAt.toNumber(),
          pendingRewards: total,
          totalClaimed:   acc.totalClaimed.toNumber() / scale,
          poolShare,
          pendingUsd: total * qhubxPrice,
        };
      } catch { return null; }
    },
    [wallet.publicKey, qhubxPrice]
  );

  const fetchBalance = useCallback(async () => {
    if (!wallet.publicKey) return 0;
    try {
      const ata = getAssociatedTokenAddressSync(
        MINT_ADDRESS, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID
      );
      const acc = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      return Number(acc.amount) / 1_000_000;
    } catch { return 0; }
  }, [connection, wallet.publicKey]);

  const refresh = useCallback(async () => {
    const program = getProgram();
    if (!program) return;
    setLoading(true);
    setError(null);
    try {
      await fetchPrice();
      const poolData = await fetchPool(program);
      setPool(poolData);
      const [stakeData, bal] = await Promise.all([
        fetchUserStake(program, poolData),
        fetchBalance(),
      ]);
      setUserStake(stakeData);
      setBalance(bal);
    } catch (e: any) {
      setError(e.message || "Failed to load QhronoX Protocol data");
    } finally {
      setLoading(false);
    }
  }, [getProgram, fetchPrice, fetchPool, fetchUserStake, fetchBalance]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // ─── Transactions ──────────────────────────────────────────────────────────
  const getAccounts = useCallback((includePDA = true) => {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const [poolPDA]  = [POOL_ADDRESS];
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), POOL_ADDRESS.toBuffer()], PROGRAM_ID
    );
    const [stakePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), POOL_ADDRESS.toBuffer(), wallet.publicKey.toBuffer()], PROGRAM_ID
    );
    const userATA = getAssociatedTokenAddressSync(
      MINT_ADDRESS, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID
    );
    return { poolPDA, vaultPDA, stakePDA, userATA };
  }, [wallet.publicKey]);

  const stake = useCallback(async (amount: number, tier: LockTier): Promise<string> => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");
    setTxPending(true); setError(null);
    try {
      const { vaultPDA, stakePDA, userATA } = getAccounts();
      const tx = await program.methods
        .stake(new BN(Math.floor(amount * 1_000_000)), tier)
        .accounts({
          user: wallet.publicKey, mint: MINT_ADDRESS,
          pool: POOL_ADDRESS, vault: vaultPDA,
          stakeInfo: stakePDA, userTokenAccount: userATA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });
      await refresh();
      return tx;
    } catch (e: any) {
      const msg = e?.message || "Stake failed";
      setError(msg); throw new Error(msg);
    } finally { setTxPending(false); }
  }, [getProgram, wallet.publicKey, getAccounts, refresh]);

  const unstake = useCallback(async (amount: number): Promise<string> => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");
    setTxPending(true); setError(null);
    try {
      const { vaultPDA, stakePDA, userATA } = getAccounts();
      const tx = await program.methods
        .unstake(new BN(Math.floor(amount * 1_000_000)))
        .accounts({
          user: wallet.publicKey, mint: MINT_ADDRESS,
          pool: POOL_ADDRESS, vault: vaultPDA,
          stakeInfo: stakePDA, userTokenAccount: userATA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc({ commitment: "confirmed" });
      await refresh();
      return tx;
    } catch (e: any) {
      const msg = e?.message || "Unstake failed";
      setError(msg); throw new Error(msg);
    } finally { setTxPending(false); }
  }, [getProgram, wallet.publicKey, getAccounts, refresh]);

  const claimRewards = useCallback(async (): Promise<string> => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");
    setTxPending(true); setError(null);
    try {
      const { vaultPDA, stakePDA, userATA } = getAccounts();
      const tx = await program.methods
        .claimRewards()
        .accounts({
          user: wallet.publicKey, mint: MINT_ADDRESS,
          pool: POOL_ADDRESS, vault: vaultPDA,
          stakeInfo: stakePDA, userTokenAccount: userATA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc({ commitment: "confirmed" });
      await refresh();
      return tx;
    } catch (e: any) {
      const msg = e?.message || "Claim failed";
      setError(msg); throw new Error(msg);
    } finally { setTxPending(false); }
  }, [getProgram, wallet.publicKey, getAccounts, refresh]);

  return { pool, userStake, userTokenBalance, qhubxPrice, loading, txPending, error, stake, unstake, claimRewards, refresh };
}
