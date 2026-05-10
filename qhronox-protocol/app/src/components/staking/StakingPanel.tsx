"use client";
/**
 * StakingPanel — Stake / Unstake / Claim UI
 * Wired directly to useStaking hook which calls the Anchor program.
 */

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useStaking, LockTier } from "@/hooks/useStaking";
import { formatNxs, formatUsd, formatDate, shortenAddr } from "@/lib/format";

const TIERS = [
  {
    id: 0 as LockTier,
    name: "Flexible",
    lockDays: 0,
    multiplier: 1,
    label: "1x",
    description: "No lock — withdraw anytime",
    colorClass: "border-gray-500 text-gray-400",
    badgeClass: "bg-gray-800 text-gray-300",
  },
  {
    id: 1 as LockTier,
    name: "3 months",
    lockDays: 90,
    multiplier: 1.5,
    label: "1.5x",
    description: "50% weight bonus — locked 90 days",
    colorClass: "border-blue-500 text-blue-400",
    badgeClass: "bg-blue-900/40 text-blue-300",
  },
  {
    id: 2 as LockTier,
    name: "1 year — VIP",
    lockDays: 365,
    multiplier: 3,
    label: "3x",
    description: "Maximum weight — ecosystem VIP status",
    colorClass: "border-yellow-500 text-yellow-400",
    badgeClass: "bg-yellow-900/40 text-yellow-300",
  },
];

export default function StakingPanel() {
  const { publicKey, connected } = useWallet();
  const {
    pool,
    userStake,
    userTokenBalance,
    qhubxPrice,
    loading,
    txPending,
    error,
    stake,
    unstake,
    claimRewards,
  } = useStaking();

  const [selectedTier, setSelectedTier] = useState<LockTier>(2);
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");
  const [txResult, setTxResult] = useState<{ sig: string; action: string } | null>(null);

  // Real-time projected yield calculation
  const projection = useMemo(() => {
    const amount = parseFloat(stakeAmount) || 0;
    if (!pool || amount <= 0) return null;

    const tier = TIERS[selectedTier];
    const myWeighted = amount * tier.multiplier;
    const newTotalWeighted = pool.totalWeighted + myWeighted;
    const myShare = myWeighted / newTotalWeighted;

    // Daily reward pool = totalFeesCollected * 70% / days_since_launch (approx)
    // For accuracy, use Helius volume data in production
    const dailyVolumeEstimate = pool.totalFeesCollected / 30; // rolling 30d average
    const dailyRewardPool = dailyVolumeEstimate * 0.7;
    const myDailyNxs = myShare * dailyRewardPool;
    const myDailyUsd = myDailyNxs * qhubxPrice;
    const stakeUsd = amount * qhubxPrice;
    const apy = stakeUsd > 0 ? (myDailyUsd * 365 / stakeUsd) * 100 : 0;

    const unlockDate = new Date();
    unlockDate.setDate(unlockDate.getDate() + tier.lockDays);

    return {
      poolShare: (myShare * 100).toFixed(4),
      dailyNxs: myDailyNxs,
      dailyUsd: myDailyUsd,
      monthlyUsd: myDailyUsd * 30,
      apy,
      unlockDate: tier.lockDays === 0 ? "Anytime" : formatDate(unlockDate),
    };
  }, [stakeAmount, selectedTier, pool, qhubxPrice]);

  const handleStake = async () => {
    const amount = parseFloat(stakeAmount);
    if (!amount || amount <= 0 || amount > userTokenBalance) return;
    try {
      const sig = await stake(amount, selectedTier);
      setTxResult({ sig, action: "Staked" });
      setStakeAmount("");
    } catch {}
  };

  const handleUnstake = async () => {
    const amount = parseFloat(unstakeAmount);
    if (!amount || amount <= 0) return;
    try {
      const sig = await unstake(amount);
      setTxResult({ sig, action: "Unstaked" });
      setUnstakeAmount("");
    } catch {}
  };

  const handleClaim = async () => {
    try {
      const sig = await claimRewards();
      setTxResult({ sig, action: "Claimed rewards" });
    } catch {}
  };

  const isLocked =
    userStake &&
    userStake.tier !== 0 &&
    Date.now() / 1000 < userStake.unlockAt;

  if (!connected) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
        <p className="text-lg font-medium text-white/60">
          Connect your wallet to participate in the ecosystem
        </p>
        <p className="mt-2 text-sm text-white/30">
          Supports Phantom, Solflare, Backpack, and all Unified Wallet Kit providers
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Left — Tier Selection + Form */}
      <div className="flex flex-col gap-4">
        {/* Lock Tier */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-widest text-white/40">
            Lock Period
          </h3>
          <div className="flex flex-col gap-2">
            {TIERS.map((tier) => {
              const stats = pool && userStake
                ? (() => {
                    const myW = (userStake.amount || 50000) * tier.multiplier;
                    const newW = pool.totalWeighted + myW;
                    const share = myW / newW;
                    const dailyPool = (pool.totalFeesCollected / 30) * 0.7;
                    const dailyNxs = share * dailyPool;
                    const stakeUsd = (userStake.amount || 50000) * qhubxPrice;
                    const apy = stakeUsd > 0 ? (dailyNxs * qhubxPrice * 365 / stakeUsd) * 100 : 0;
                    return `Est. daily: ${formatNxs(dailyNxs)} QHUBX · APY ~${apy.toFixed(1)}%`;
                  })()
                : "Loading...";

              return (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTier(tier.id)}
                  className={`relative rounded-lg border p-4 text-left transition-all ${
                    selectedTier === tier.id
                      ? tier.colorClass + " bg-white/5"
                      : "border-white/10 text-white/60 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{tier.name}</span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tier.badgeClass}`}>
                      {tier.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/40">{tier.description}</p>
                  <p className="mt-1 text-xs font-mono text-white/30">{stats}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stake / Unstake Tabs */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex gap-1 rounded-lg bg-white/5 p-1">
            {(["stake", "unstake"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-md py-2 text-sm font-medium capitalize transition-all ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "stake" ? (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-white/40">Amount to stake</label>
                  <span className="font-mono text-xs text-white/30">
                    Balance: {formatNxs(userTokenBalance)} QHUBX
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder="0"
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-lg font-bold text-white outline-none focus:border-white/25 placeholder:text-white/20"
                  />
                  <button
                    onClick={() => setStakeAmount(userTokenBalance.toString())}
                    className="rounded-lg bg-blue-900/40 px-3 text-xs font-bold text-blue-300 hover:bg-blue-900/60"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {projection && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 font-mono text-sm">
                  <div className="flex justify-between py-1 text-white/50">
                    <span>Pool share</span>
                    <span className="text-blue-400">{projection.poolShare}%</span>
                  </div>
                  <div className="flex justify-between py-1 text-white/50">
                    <span>Daily real yield</span>
                    <span className="text-green-400">{formatUsd(projection.dailyUsd)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-white/50">
                    <span>Monthly est.</span>
                    <span className="text-green-400">{formatUsd(projection.monthlyUsd)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-white/50">
                    <span>Est. APY</span>
                    <span className="text-white">~{projection.apy.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between py-1 text-white/50">
                    <span>Unlock</span>
                    <span className="text-white">{projection.unlockDate}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleStake}
                disabled={
                  txPending ||
                  !stakeAmount ||
                  parseFloat(stakeAmount) <= 0 ||
                  parseFloat(stakeAmount) > userTokenBalance
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {txPending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing transaction...
                  </>
                ) : (
                  <>
                    🔒 Stake {stakeAmount || "0"} QHUBX — {TIERS[selectedTier].name}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {isLocked && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-900/10 p-3 text-sm text-yellow-400">
                  Tokens locked until {formatDate(new Date(userStake!.unlockAt * 1000))}
                </div>
              )}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-white/40">Amount to unstake</label>
                  <span className="font-mono text-xs text-white/30">
                    Staked: {formatNxs(userStake?.amount || 0)} QHUBX
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={unstakeAmount}
                    onChange={(e) => setUnstakeAmount(e.target.value)}
                    placeholder="0"
                    disabled={isLocked ?? false}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-lg font-bold text-white outline-none focus:border-white/25 placeholder:text-white/20 disabled:opacity-40"
                  />
                  <button
                    onClick={() => setUnstakeAmount((userStake?.amount || 0).toString())}
                    disabled={isLocked ?? false}
                    className="rounded-lg bg-white/5 px-3 text-xs font-bold text-white/40 hover:bg-white/10 disabled:opacity-40"
                  >
                    MAX
                  </button>
                </div>
              </div>
              <button
                onClick={handleUnstake}
                disabled={txPending || isLocked || !unstakeAmount || parseFloat(unstakeAmount) <= 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 py-3.5 font-medium text-white/70 transition-all hover:border-white/40 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {txPending ? "Signing..." : "Unstake QHUBX"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right — Current Position + Rewards */}
      <div className="flex flex-col gap-4">
        {userStake && userStake.amount > 0 ? (
          <>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-4 text-sm font-medium uppercase tracking-widest text-white/40">
                Your position
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Staked", value: formatNxs(userStake.amount) + " QHUBX", accent: "" },
                  { label: "Pool share", value: userStake.poolShare.toFixed(4) + "%", accent: "text-blue-400" },
                  { label: "Multiplier", value: userStake.multiplier + "x", accent: "text-yellow-400" },
                  { label: "Tier", value: TIERS[userStake.tier].name, accent: "" },
                  { label: "Staked at", value: formatDate(new Date(userStake.stakedAt * 1000)), accent: "" },
                  {
                    label: "Unlocks",
                    value: userStake.tier === 0 ? "Anytime" : formatDate(new Date(userStake.unlockAt * 1000)),
                    accent: isLocked ? "text-yellow-400" : "text-green-400",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-white/5 p-3">
                    <p className="text-xs text-white/30">{item.label}</p>
                    <p className={`mt-1 font-mono text-sm font-bold ${item.accent || "text-white"}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-4 text-sm font-medium uppercase tracking-widest text-white/40">
                Pending rewards
              </h3>
              <div className="mb-4 rounded-lg border border-green-500/20 bg-green-900/10 p-5 text-center">
                <p className="font-mono text-3xl font-bold text-green-400">
                  {formatNxs(userStake.pendingRewards)} QHUBX
                </p>
                <p className="mt-1 font-mono text-sm text-white/40">
                  ≈ {formatUsd(userStake.pendingUsd)}
                </p>
              </div>
              <div className="mb-3 flex justify-between font-mono text-sm text-white/40">
                <span>Total claimed all-time</span>
                <span>{formatNxs(userStake.totalClaimed)} QHUBX</span>
              </div>
              <button
                onClick={handleClaim}
                disabled={txPending || userStake.pendingRewards <= 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-500/50 py-3 font-medium text-green-400 transition-all hover:bg-green-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {txPending ? "Signing..." : "⬇ Claim rewards to wallet"}
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-white/40">No active stake position.</p>
            <p className="mt-1 text-sm text-white/20">
              Stake QHUBX tokens to start earning real yield from ecosystem fees.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-900/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* TX Success */}
        {txResult && (
          <div className="rounded-lg border border-green-500/30 bg-green-900/10 p-4">
            <p className="text-sm font-medium text-green-400">{txResult.action} successfully</p>
            <a
              href={`https://solscan.io/tx/${txResult.sig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block font-mono text-xs text-white/30 hover:text-white/60"
            >
              {txResult.sig.slice(0, 20)}...{txResult.sig.slice(-10)} ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
