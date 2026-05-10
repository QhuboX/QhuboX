"use client";
/**
 * GovernancePanel — On-chain governance for QhronoX Protocol.
 * Only stakers can vote. Voting power = weighted QHUBX staked.
 * Proposals are stored on-chain (extend the Anchor program with a Proposal account).
 */

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useStaking } from "@/hooks/useStaking";
import { formatNxs } from "@/lib/format";

// In production: fetch proposals from on-chain via program.account.proposal.all()
// These represent the real proposal structure from the Anchor program
const MOCK_PROPOSALS = [
  {
    id: "QXP-001",
    title: "Increase burn allocation from 10% to 15% of fees",
    description:
      "Reduce staker share from 70% to 65% and redirect 5% to burn, creating stronger deflationary pressure. Treasury stays at 20%.",
    status: "active" as const,
    daysLeft: 3,
    votesYes: 6_320_000,
    votesNo: 3_710_000,
    quorum: 10_000_000,
    proposer: "7xK3...9mPq",
  },
  {
    id: "QXP-002",
    title: "Add 6-month lock tier at 2x multiplier",
    description:
      "Insert a new tier between Flexible (1x) and 1-year VIP (3x). Lock period: 180 days. Multiplier: 2x. Requires contract upgrade.",
    status: "active" as const,
    daysLeft: 5,
    votesYes: 8_100_000,
    votesNo: 1_900_000,
    quorum: 10_000_000,
    proposer: "4nPq...2mLw",
  },
  {
    id: "QXP-003",
    title: "Allocate $20,000 from treasury to CEX listing campaign",
    description:
      "Use treasury funds for a Gate.io or MEXC listing. Estimated cost: $15k–$20k. Marketing budget for listing support: $5k.",
    status: "passed" as const,
    daysLeft: 0,
    votesYes: 7_400_000,
    votesNo: 2_600_000,
    quorum: 10_000_000,
    proposer: "9qRt...1nHj",
  },
  {
    id: "QXP-004",
    title: "Enable auto-compound for VIP tier stakers",
    description:
      "1-year VIP stakers can opt-in to auto-compound rewards directly back into stake without claiming. Requires smart contract update.",
    status: "pending" as const,
    daysLeft: 0,
    votesYes: 0,
    votesNo: 0,
    quorum: 10_000_000,
    proposer: "2wZx...7kVb",
  },
];

const STATUS_STYLE = {
  active: "bg-green-900/40 text-green-400 border border-green-700/30",
  passed: "bg-blue-900/40 text-blue-400 border border-blue-700/30",
  pending: "bg-white/5 text-white/30 border border-white/10",
  rejected: "bg-red-900/30 text-red-400 border border-red-700/30",
};

export default function GovernancePanel() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { userStake } = useStaking();
  const [voted, setVoted] = useState<Record<string, "yes" | "no">>({});

  const votingPower = userStake?.weightedAmount || 0;
  const canVote = votingPower > 0;

  const handleVote = (proposalId: string, side: "yes" | "no") => {
    if (!canVote) return;
    setVoted((prev) => ({ ...prev, [proposalId]: side }));
    // TODO: call program.methods.castVote(proposalId, side).rpc()
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-white">Protocol Governance</h2>
          <p className="mt-0.5 text-xs text-white/30">
            Only QHUBX stakers can vote. Power = weighted staked amount.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-[#b8a96a]">
            {formatNxs(votingPower)} QHUBX
          </p>
          <p className="font-mono text-[10px] text-white/25">Your voting power</p>
        </div>
      </div>

      {!connected && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] py-10 text-center">
          <p className="text-white/40">Connect wallet to vote on proposals</p>
          <button
            onClick={() => setVisible(true)}
            className="mt-4 rounded-lg bg-[#b8a96a] px-5 py-2 text-sm font-semibold text-black hover:opacity-85 transition-opacity"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {/* Proposals */}
      <div className="flex flex-col gap-4">
        {MOCK_PROPOSALS.map((p) => {
          const totalVotes = p.votesYes + p.votesNo;
          const yesPct = totalVotes > 0 ? (p.votesYes / totalVotes) * 100 : 0;
          const noPct = totalVotes > 0 ? (p.votesNo / totalVotes) * 100 : 0;
          const quorumPct = Math.min(100, (totalVotes / p.quorum) * 100);
          const myVote = voted[p.id];
          const alreadyVoted = !!myVote;

          return (
            <div
              key={p.id}
              className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"
            >
              {/* Top row */}
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-white/25">{p.id}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        STATUS_STYLE[p.status]
                      }`}
                    >
                      {p.status === "active" ? `Live — ${p.daysLeft}d left` : p.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-white">{p.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-white/35">{p.description}</p>
                  <p className="mt-1.5 font-mono text-[10px] text-white/20">
                    Proposed by: {p.proposer}
                  </p>
                </div>
              </div>

              {/* Vote bars */}
              {totalVotes > 0 ? (
                <div className="mb-4 flex flex-col gap-2">
                  {/* Yes */}
                  <div className="flex items-center gap-3">
                    <span className="w-8 font-mono text-[10px] text-green-400">YES</span>
                    <div className="relative flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-green-500 transition-all duration-700"
                        style={{ width: `${yesPct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[10px] text-green-400">
                      {yesPct.toFixed(1)}%
                    </span>
                  </div>
                  {/* No */}
                  <div className="flex items-center gap-3">
                    <span className="w-8 font-mono text-[10px] text-red-400">NO</span>
                    <div className="relative flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-red-500/70 transition-all duration-700"
                        style={{ width: `${noPct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[10px] text-red-400">
                      {noPct.toFixed(1)}%
                    </span>
                  </div>
                  {/* Quorum */}
                  <div className="flex items-center gap-3">
                    <span className="w-8 font-mono text-[10px] text-white/25">QRM</span>
                    <div className="relative flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-[#b8a96a]/60 transition-all duration-700"
                        style={{ width: `${quorumPct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[10px] text-white/25">
                      {quorumPct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-white/20">
                    {formatNxs(totalVotes)} / {formatNxs(p.quorum)} QHUBX quorum
                  </p>
                </div>
              ) : (
                <p className="mb-4 font-mono text-[10px] text-white/20">
                  Voting not yet started.
                </p>
              )}

              {/* Vote buttons */}
              {p.status === "active" && connected && (
                <div className="flex gap-3">
                  {alreadyVoted ? (
                    <div className="flex-1 rounded-lg border border-white/10 py-2.5 text-center font-mono text-xs text-white/30">
                      ✓ Voted {myVote?.toUpperCase()} with {formatNxs(votingPower)} QHUBX
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleVote(p.id, "yes")}
                        disabled={!canVote}
                        className="flex-1 rounded-lg border border-green-700/40 bg-green-900/20 py-2.5 text-sm font-medium text-green-400 transition-all hover:bg-green-900/40 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ✓ Vote Yes
                      </button>
                      <button
                        onClick={() => handleVote(p.id, "no")}
                        disabled={!canVote}
                        className="flex-1 rounded-lg border border-red-700/30 bg-red-900/10 py-2.5 text-sm font-medium text-red-400 transition-all hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ✗ Vote No
                      </button>
                    </>
                  )}
                </div>
              )}

              {p.status === "active" && !connected && (
                <button
                  onClick={() => setVisible(true)}
                  className="w-full rounded-lg border border-[#b8a96a]/30 py-2.5 text-sm text-[#b8a96a]/60 hover:border-[#b8a96a]/60 transition-colors"
                >
                  Connect wallet to vote
                </button>
              )}

              {p.status === "active" && connected && !canVote && (
                <p className="text-center font-mono text-xs text-white/25">
                  You need staked QHUBX to vote.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
