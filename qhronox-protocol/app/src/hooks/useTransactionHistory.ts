"use client";
/**
 * QhronoX Protocol — useTransactionHistory
 * Fetches real on-chain tx history via Helius enhanced transactions API.
 */

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY!;
const PROGRAM_ID     = process.env.NEXT_PUBLIC_PROGRAM_ID!;

export type TxType = "stake" | "unstake" | "claim" | "deposit_fees" | "unknown";

export interface ParsedTx {
  signature:   string;
  type:        TxType;
  amountQhubx:  number;
  amountUsd:  number;
  timestamp:  number;
  slot:        number;
  status:      "success" | "failed";
  explorerUrl: string;
}

export function useTransactionHistory(qhubxPrice: number) {
  const { publicKey } = useWallet();
  const [transactions, setTransactions] = useState<ParsedTx[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const url = `https://api.helius.xyz/v0/addresses/${publicKey.toBase58()}/transactions?api-key=${HELIUS_API_KEY}&limit=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Helius API error: ${res.status}`);
      const rawTxs: any[] = await res.json();

      const parsed: ParsedTx[] = rawTxs
        .filter((tx) => tx.accountData?.some((a: any) => a.account === PROGRAM_ID))
        .map((tx) => {
          const type     = detectType(tx);
          const amountQhubx = extractAmount(tx);
          return {
            signature:   tx.signature,
            type,
            amountQhubx,
            amountUsd:  amountQhubx * qhubxPrice,
            timestamp:  tx.timestamp,
            slot:        tx.slot,
            status:      tx.transactionError ? "failed" : "success",
            explorerUrl: `https://solscan.io/tx/${tx.signature}`,
          };
        });

      setTransactions(parsed);
    } catch (e: any) {
      setError(e.message || "Failed to fetch QhronoX transaction history");
    } finally {
      setLoading(false);
    }
  }, [publicKey, qhubxPrice]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return { transactions, loading, error, refresh: fetchHistory };
}

function detectType(tx: any): TxType {
  const desc = (tx.description || "").toLowerCase();
  const type = (tx.type       || "").toLowerCase();
  if (desc.includes("stake")   || type.includes("stake"))   return "stake";
  if (desc.includes("unstake") || type.includes("unstake")) return "unstake";
  if (desc.includes("claim")   || desc.includes("reward"))  return "claim";
  if (desc.includes("deposit") || type.includes("deposit")) return "deposit_fees";
  return "unknown";
}

function extractAmount(tx: any): number {
  try {
    const mint     = process.env.NEXT_PUBLIC_MINT_ADDRESS!;
    const transfer = (tx.tokenTransfers || []).find((t: any) => t.mint === mint);
    return transfer ? Math.abs(transfer.tokenAmount) : 0;
  } catch { return 0; }
}
