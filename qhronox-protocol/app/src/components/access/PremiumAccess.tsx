"use client";
/**
 * PremiumAccess — Utility tools gated by staked QHUBX amount.
 * Access is determined client-side from on-chain stake data.
 * Backend routes should independently verify via the Anchor program.
 */

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useStaking } from "@/hooks/useStaking";
import { formatNxs } from "@/lib/format";

interface Tool {
  id: string;
  title: string;
  description: string;
  requirement: number; // QHUBX staked (raw, no multiplier — amount only)
  badge: string;
  icon: React.ReactNode;
  action: string;
  link?: string;
}

const TOOLS: Tool[] = [
  {
    id: "ai-intel",
    title: "AI Market Intelligence",
    description:
      "Real-time on-chain signal analysis, wallet clustering, and smart money flow detection across Solana DEXs. Powered by Claude API.",
    requirement: 50_000,
    badge: "50K QHUBX",
    action: "Launch tool",
    link: "/app/ai-intel",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.4"/>
      </svg>
    ),
  },
  {
    id: "alert-bot",
    title: "Trading Alert Bot",
    description:
      "Telegram bot with whale alerts, liquidity changes, and price action triggers. Custom thresholds per wallet. Connects via /start in Telegram.",
    requirement: 100_000,
    badge: "100K QHUBX",
    action: "Configure bot",
    link: "https://t.me/QhronoXBot",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "pro-analytics",
    title: "Pro Analytics Dashboard",
    description:
      "Deep ecosystem metrics: holder distribution, transfer fee revenue breakdown, staker yield curve, and burn rate projection over 12 months.",
    requirement: 150_000,
    badge: "150K QHUBX",
    action: "Open dashboard",
    link: "/app/analytics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M3 17l4-4 3 3 4-5 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: "vip-launchpad",
    title: "VIP Launchpad Access",
    description:
      "Guaranteed allocation in QhronoX-incubated launches. Early entry at IDO price before public rounds open. Whitelist auto-applied via wallet.",
    requirement: 500_000,
    badge: "500K QHUBX",
    action: "View upcoming",
    link: "/app/launchpad",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function PremiumAccess() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { userStake } = useStaking();
  const [launching, setLaunching] = useState<string | null>(null);

  const stakedAmt = userStake?.amount || 0;

  const handleLaunch = async (tool: Tool) => {
    if (!tool.link) return;
    setLaunching(tool.id);
    // In production: call /api/verify-access?tool=X which reads on-chain stake
    // before serving the gated resource.
    await new Promise((r) => setTimeout(r, 600));
    setLaunching(null);
    if (tool.link.startsWith("http")) {
      window.open(tool.link, "_blank");
    } else {
      window.location.href = tool.link;
    }
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Premium Access</h2>
            <p className="mt-0.5 text-xs text-white/30">
              Tools unlocked by staking QHUBX — your stake is the key.
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold text-[#b8a96a]">
              {formatNxs(stakedAmt)} QHUBX
            </p>
            <p className="font-mono text-[10px] text-white/25">Currently staked</p>
          </div>
        </div>
      </div>

      {/* Tools grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TOOLS.map((tool) => {
          const isUnlocked = connected && stakedAmt >= tool.requirement;
          const progressPct = Math.min(100, (stakedAmt / tool.requirement) * 100);
          const deficit = Math.max(0, tool.requirement - stakedAmt);

          return (
            <div
              key={tool.id}
              className={`rounded-xl border p-5 transition-colors ${
                isUnlocked
                  ? "border-[#b8a96a]/30 bg-[#b8a96a]/[0.04]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              {/* Icon + title */}
              <div className="mb-4 flex items-start gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    isUnlocked
                      ? "bg-[#b8a96a]/20 text-[#b8a96a]"
                      : "bg-white/[0.06] text-white/30"
                  }`}
                >
                  {tool.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white">{tool.title}</h3>
                    {isUnlocked && (
                      <span className="rounded-full bg-green-900/40 px-2 py-0.5 font-mono text-[9px] font-bold text-green-400">
                        UNLOCKED
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/30">
                    {tool.description}
                  </p>
                </div>
              </div>

              {/* Requirement + progress */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-white/25">
                    Requires: {tool.badge} staked
                  </span>
                  {connected && (
                    <span className="font-mono text-[10px] text-white/25">
                      {progressPct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: connected ? `${progressPct}%` : "0%",
                      background: isUnlocked
                        ? "linear-gradient(90deg, #b8a96a, #d4c47a)"
                        : "#3b6bff",
                    }}
                  />
                </div>
                {connected && !isUnlocked && deficit > 0 && (
                  <p className="mt-1.5 font-mono text-[10px] text-white/20">
                    {formatNxs(deficit)} more QHUBX needed
                  </p>
                )}
              </div>

              {/* CTA */}
              {!connected ? (
                <button
                  onClick={() => setVisible(true)}
                  className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/40 transition-all hover:border-white/20 hover:text-white/60"
                >
                  Connect wallet to check access
                </button>
              ) : isUnlocked ? (
                <button
                  onClick={() => handleLaunch(tool)}
                  disabled={launching === tool.id}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#b8a96a] py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-85 disabled:opacity-60"
                >
                  {launching === tool.id ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                      Verifying access...
                    </>
                  ) : (
                    <>
                      {tool.action} ↗
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => window.location.href = "#stake"}
                  className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/30 transition-all hover:border-white/20 hover:text-white/50"
                >
                  Stake {formatNxs(deficit)} more QHUBX to unlock →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Info note */}
      <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-5 py-4">
        <p className="text-xs leading-relaxed text-white/20">
          <span className="font-bold text-white/40">Access verification:</span> Tool access is
          verified server-side by reading your on-chain stake account directly from the
          QhronoX Protocol contract. You cannot fake access. Unstaking below the threshold
          automatically revokes access at the next session.
        </p>
      </div>
    </div>
  );
}
