"use client";

import { useStaking } from "@/hooks/useStaking";
import { formatNxs, formatUsd, formatPct } from "@/lib/format";

export default function KPIGrid() {
  const { pool, userStake, qhubxPrice, loading } = useStaking();

  const tvlUsd = pool ? pool.totalStaked * qhubxPrice : 0;
  const dailyEst = userStake && pool
    ? (() => {
        const share = pool.totalWeighted > 0
          ? userStake.weightedAmount / pool.totalWeighted
          : 0;
        const dailyPool = (pool.totalFeesCollected / 30) * 0.7;
        return share * dailyPool * qhubxPrice;
      })()
    : 0;

  const apyEst = userStake && userStake.amount > 0 && dailyEst > 0
    ? (dailyEst * 365 / (userStake.amount * qhubxPrice)) * 100
    : 0;

  const cards = [
    {
      label: "Total Value Locked",
      value: tvlUsd > 0 ? formatUsd(tvlUsd) : "—",
      sub: pool ? formatNxs(pool.totalStaked) + " QHUBX staked" : "Loading...",
      accent: "#00e5a0",
      icon: (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <rect x="3" y="7" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: "QHUBX Burned",
      value: pool ? formatNxs(pool.totalBurned) : "—",
      sub: "Deflationary — supply shrinking",
      accent: "#b8a96a",
      icon: (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <path d="M10 3c0 3-4 5-4 8a4 4 0 008 0c0-3-4-5-4-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M10 13v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: "Your Pool Share",
      value: userStake ? formatPct(userStake.poolShare, 4) : "—",
      sub: userStake
        ? `${formatNxs(userStake.weightedAmount)} QHUBX weighted`
        : "Not staking yet",
      accent: "#3b6bff",
      badge: userStake ? `${userStake.multiplier}x multiplier` : null,
      icon: (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 10L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
        </svg>
      ),
    },
    {
      label: "Real Yield (Live)",
      value: dailyEst > 0 ? formatUsd(dailyEst) : "—",
      sub: "Estimated earnings today",
      accent: "#00e5a0",
      badge: apyEst > 0 ? `~${apyEst.toFixed(1)}% APY est.` : null,
      icon: (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <path d="M3 14l4-4 3 3 4-5 3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 transition-colors hover:border-white/10"
          style={{
            borderTopColor: card.accent,
            borderTopWidth: "2px",
          }}
        >
          <div
            className="mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            <span style={{ color: card.accent }}>{card.icon}</span>
            {card.label}
          </div>
          <div className="mb-1 font-mono text-xl font-bold text-white">
            {loading ? (
              <span className="inline-block h-6 w-24 animate-pulse rounded bg-white/10" />
            ) : (
              card.value
            )}
          </div>
          <div className="font-mono text-[11px] text-white/25">{card.sub}</div>
          {card.badge && (
            <div
              className="mt-3 inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
              style={{
                background: card.accent + "18",
                color: card.accent,
              }}
            >
              {card.badge}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
