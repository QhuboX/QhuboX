"use client";
/**
 * QvaultX — The user's personal security vault view.
 * Shows their staked funds, reward accumulation, lock status,
 * and the animated hourglass visual.
 */

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useStaking } from "@/hooks/useStaking";
import RewardHourglass from "@/components/ui/RewardHourglass";
import { formatNxs, formatUsd, formatDate, formatTimestamp } from "@/lib/format";

const TIER_NAMES = ["Flexible", "3 Months", "1 Year — VIP"];
const TIER_COLORS = ["text-gray-400", "text-blue-400", "text-[#b8a96a]"];
const TIER_BORDER = ["border-gray-700", "border-blue-700/50", "border-[#b8a96a]/50"];

export default function QvaultX() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { pool, userStake, qhubxPrice, loading, claimRewards, txPending, error } =
    useStaking();

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] py-20">
        <div className="relative h-16 w-16">
          {/* Vault icon */}
          <svg viewBox="0 0 64 64" fill="none" className="h-full w-full opacity-30">
            <rect x="8" y="16" width="48" height="38" rx="4" stroke="#b8a96a" strokeWidth="2.5" />
            <circle cx="32" cy="35" r="10" stroke="#b8a96a" strokeWidth="2" />
            <circle cx="32" cy="35" r="4" fill="#b8a96a" opacity="0.4" />
            <line x1="24" y1="16" x2="24" y2="10" stroke="#b8a96a" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="40" y1="16" x2="40" y2="10" stroke="#b8a96a" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-lg font-medium text-white/50">Connect to access QvaultX</p>
        <p className="max-w-sm text-center text-sm text-white/25">
          Your personal secure vault — view staked funds, pending rewards, and lock status.
        </p>
        <button
          onClick={() => setVisible(true)}
          className="mt-2 rounded-lg bg-[#b8a96a] px-6 py-2.5 text-sm font-semibold text-black hover:opacity-85 transition-opacity"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-white/30">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#b8a96a]" />
          Loading QvaultX...
        </div>
      </div>
    );
  }

  const hasStake = userStake && userStake.amount > 0;
  const isLocked =
    hasStake && userStake!.tier !== 0 && Date.now() / 1000 < userStake!.unlockAt;
  const stakeUsd = hasStake ? userStake!.amount * qhubxPrice : 0;
  const dailyUsd = hasStake && pool
    ? (() => {
        const share = userStake!.weightedAmount / pool.totalWeighted;
        const dailyPool = (pool.totalFeesCollected / 30) * 0.7;
        return share * dailyPool * qhubxPrice;
      })()
    : 0;
  const fillPercent = dailyUsd > 0 ? Math.min(100, (userStake!.pendingUsd / dailyUsd) * 100) : 0;
  const unlockTimeLeft = hasStake && isLocked
    ? Math.max(0, userStake!.unlockAt - Date.now() / 1000)
    : 0;
  const daysLeft = Math.ceil(unlockTimeLeft / 86400);

  return (
    <div className="flex flex-col gap-5">

      {/* QvaultX Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#b8a96a]/30 bg-[#b8a96a]/10">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <rect x="3" y="6" width="18" height="15" rx="2" stroke="#b8a96a" strokeWidth="1.5" />
            <circle cx="12" cy="13.5" r="3.5" stroke="#b8a96a" strokeWidth="1.5" />
            <circle cx="12" cy="13.5" r="1.2" fill="#b8a96a" />
            <path d="M9 6V4a3 3 0 0 1 6 0v2" stroke="#b8a96a" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">QvaultX</h2>
          <p className="text-xs text-white/30">Your personal security vault</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Hourglass Column */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#b8a96a]/20 bg-[#b8a96a]/[0.03] p-8">
          <p className="mb-6 text-center text-xs font-mono uppercase tracking-widest text-[#b8a96a]/60">
            Real Yield Accumulation
          </p>
          <RewardHourglass
            fillPercent={fillPercent}
            dailyUsd={dailyUsd}
            pendingUsd={hasStake ? userStake!.pendingUsd : 0}
            isEarning={hasStake && !!(pool && pool.totalFeesCollected > 0)}
          />

          {hasStake && (
            <button
              onClick={claimRewards}
              disabled={txPending || !hasStake || userStake!.pendingRewards <= 0}
              className="mt-6 w-full rounded-xl border border-[#b8a96a]/40 py-3 text-sm font-semibold text-[#b8a96a] transition-all hover:bg-[#b8a96a]/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {txPending ? "Signing..." : "⬇ Claim rewards"}
            </button>
          )}
        </div>

        {/* Vault Stats */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
          <h3 className="mb-5 text-xs font-mono uppercase tracking-widest text-white/30">
            Vault contents
          </h3>

          {hasStake ? (
            <div className="flex flex-col gap-4">
              {/* Main balance */}
              <div className="rounded-xl border border-[#b8a96a]/20 bg-[#b8a96a]/[0.06] p-5 text-center">
                <p className="text-xs text-white/30 mb-1">Total staked value</p>
                <p className="font-mono text-3xl font-bold text-[#b8a96a]">
                  {formatUsd(stakeUsd)}
                </p>
                <p className="mt-1 font-mono text-sm text-white/40">
                  {formatNxs(userStake!.amount)} QHUBX
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/[0.04] p-3">
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Tier</p>
                  <p className={`font-mono text-sm font-bold ${TIER_COLORS[userStake!.tier]}`}>
                    {TIER_NAMES[userStake!.tier]}
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.04] p-3">
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Multiplier</p>
                  <p className="font-mono text-sm font-bold text-white">
                    {userStake!.multiplier}x
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.04] p-3">
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Pool share</p>
                  <p className="font-mono text-sm font-bold text-blue-400">
                    {userStake!.poolShare.toFixed(4)}%
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.04] p-3">
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Claimed</p>
                  <p className="font-mono text-sm font-bold text-green-400">
                    {formatNxs(userStake!.totalClaimed)}
                  </p>
                </div>
              </div>

              {/* Lock status */}
              <div
                className={`rounded-lg border p-4 ${
                  isLocked
                    ? "border-yellow-600/30 bg-yellow-900/10"
                    : "border-green-600/30 bg-green-900/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{isLocked ? "🔒" : "🔓"}</span>
                  <div>
                    <p className={`text-sm font-medium ${isLocked ? "text-yellow-400" : "text-green-400"}`}>
                      {isLocked ? `Locked — ${daysLeft} days remaining` : "Unlocked — withdraw anytime"}
                    </p>
                    {userStake!.tier !== 0 && (
                      <p className="text-xs text-white/25 mt-0.5">
                        Unlocks: {formatDate(new Date(userStake!.unlockAt * 1000))}
                      </p>
                    )}
                  </div>
                </div>
                {isLocked && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-yellow-500/60 transition-all duration-1000"
                        style={{
                          width: `${Math.min(
                            100,
                            ((Date.now() / 1000 - userStake!.stakedAt) /
                              (userStake!.unlockAt - userStake!.stakedAt)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-right font-mono text-[10px] text-white/20">
                      {(
                        ((Date.now() / 1000 - userStake!.stakedAt) /
                          (userStake!.unlockAt - userStake!.stakedAt)) *
                        100
                      ).toFixed(1)}% of lock period elapsed
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-white/30">No staked position found.</p>
              <p className="mt-1 text-xs text-white/15">
                Go to Stake tab to open your vault.
              </p>
            </div>
          )}
        </div>

        {/* Fee Flow */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
          <h3 className="mb-5 text-xs font-mono uppercase tracking-widest text-white/30">
            Protocol fee flow — all time
          </h3>

          {pool ? (
            <div className="flex flex-col gap-3">
              {/* 3% bar */}
              <div className="rounded-xl border border-white/10 p-4 text-center bg-white/[0.03]">
                <p className="text-xs text-white/30 mb-1">Total 3% fees collected</p>
                <p className="font-mono text-2xl font-bold text-[#b8a96a]">
                  {formatNxs(pool.totalFeesCollected)} QHUBX
                </p>
              </div>

              {/* Distribution bars */}
              <div className="flex h-3 gap-1 rounded-full overflow-hidden">
                <div className="h-full rounded-l-full bg-green-500" style={{ width: "70%" }} />
                <div className="h-full bg-blue-500" style={{ width: "20%" }} />
                <div className="h-full rounded-r-full bg-[#b8a96a]" style={{ width: "10%" }} />
              </div>

              <div className="flex flex-col gap-3">
                {[
                  {
                    label: "Staker rewards",
                    pct: "70%",
                    val: pool.totalFeesCollected * 0.7,
                    color: "text-green-400",
                    dot: "bg-green-500",
                  },
                  {
                    label: "Treasury & marketing",
                    pct: "20%",
                    val: pool.totalFeesCollected * 0.2,
                    color: "text-blue-400",
                    dot: "bg-blue-500",
                  },
                  {
                    label: "Burned (deflationary)",
                    pct: "10%",
                    val: pool.totalBurned,
                    color: "text-[#b8a96a]",
                    dot: "bg-[#b8a96a]",
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-sm ${item.dot}`} />
                      <span className="text-xs text-white/40">{item.label}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono text-xs font-bold ${item.color}`}>
                        {item.pct}
                      </span>
                      <p className="font-mono text-[10px] text-white/20">
                        {formatNxs(item.val)} QHUBX
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 border-t border-white/[0.06] pt-3">
                <div className="flex justify-between">
                  <span className="text-xs text-white/30">TVL</span>
                  <span className="font-mono text-xs font-bold text-white">
                    {formatNxs(pool.totalStaked)} QHUBX
                  </span>
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-xs text-white/30">Total stakers</span>
                  <span className="font-mono text-xs font-bold text-white">
                    — (on-chain)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-white/20 text-sm py-10">Loading pool data...</p>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-900/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
