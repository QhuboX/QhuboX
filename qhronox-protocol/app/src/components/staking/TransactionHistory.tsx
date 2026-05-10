"use client";

import { useStaking } from "@/hooks/useStaking";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { formatNxs, formatUsd, formatTimestamp, shortenAddr } from "@/lib/format";

const TYPE_STYLES: Record<string, string> = {
  stake: "bg-blue-900/40 text-blue-300",
  unstake: "bg-white/10 text-white/50",
  claim: "bg-green-900/40 text-green-300",
  deposit_fees: "bg-[#b8a96a]/10 text-[#b8a96a]",
  unknown: "bg-white/5 text-white/30",
};

export default function TransactionHistory() {
  const { nxsPrice } = useStaking();
  const { transactions, loading, error, refresh } = useTransactionHistory(nxsPrice);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Transaction History</h3>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-white/25">
            {transactions.length} transactions
          </span>
          <button
            onClick={refresh}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/40 transition-colors hover:border-white/20 hover:text-white/60"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-900/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : transactions.length === 0 ? (
        <div className="py-10 text-center text-sm text-white/25">
          No transactions found for this wallet in QhronoX Protocol.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {["Type", "Amount QHUBX", "USD Value", "Timestamp", "Tx Hash", "Status"].map((h) => (
                  <th
                    key={h}
                    className="pb-3 pr-4 font-mono text-[10px] uppercase tracking-widest text-white/25"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.signature}
                  className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                >
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        TYPE_STYLES[tx.type] || TYPE_STYLES.unknown
                      }`}
                    >
                      {tx.type}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-white/70">
                    {formatNxs(tx.amountQhubx)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-white/50">
                    {formatUsd(tx.amountUsd)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-white/30">
                    {formatTimestamp(tx.timestamp)}
                  </td>
                  <td className="py-3 pr-4">
                    <a
                      href={tx.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[#b8a96a]/70 transition-colors hover:text-[#b8a96a]"
                    >
                      {shortenAddr(tx.signature, 6)} ↗
                    </a>
                  </td>
                  <td className="py-3">
                    <span
                      className={`font-mono text-[10px] font-bold ${
                        tx.status === "success" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {tx.status === "success" ? "✓ Confirmed" : "✗ Failed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
