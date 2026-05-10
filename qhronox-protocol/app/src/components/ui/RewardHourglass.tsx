"use client";
/**
 * RewardHourglass — Animated SVG hourglass that fills with QhronoX brand color
 * as the user accumulates staking rewards. The fill percentage mirrors
 * (pendingRewards / dailyYieldTarget) capped at 100%.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  fillPercent: number; // 0–100
  dailyUsd: number;
  pendingUsd: number;
  isEarning: boolean;
}

export default function RewardHourglass({
  fillPercent,
  dailyUsd,
  pendingUsd,
  isEarning,
}: Props) {
  const [displayFill, setDisplayFill] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Smooth animated fill
  useEffect(() => {
    const target = Math.min(100, Math.max(0, fillPercent));
    const step = () => {
      setDisplayFill((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.1) return target;
        rafRef.current = requestAnimationFrame(step);
        return prev + diff * 0.04;
      });
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [fillPercent]);

  // SVG hourglass geometry
  const W = 120;
  const H = 200;
  const NECK = 10;
  const TOP_W = 70;
  const BOT_W = 70;

  // Top half trapezoid (upside-down): from wide at top to neck in middle
  const topLeft = (W - TOP_W) / 2;
  const topRight = topLeft + TOP_W;
  const midLeft = W / 2 - NECK / 2;
  const midRight = W / 2 + NECK / 2;
  const midY = H / 2;

  // Sand in top half falls as fill increases
  const topFillRatio = Math.max(0, 1 - displayFill / 100);
  const topSandY = midY - (midY - 10) * topFillRatio;

  // Bottom half: sand accumulates from bottom up
  const botFillRatio = displayFill / 100;
  const botSandHeight = (H / 2 - 10) * botFillRatio;
  const botSandY = H - 10 - botSandHeight;

  // Gradient stops
  const gradId = "qhx-gold";

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d4c47a" />
            <stop offset="50%" stopColor="#b8a96a" />
            <stop offset="100%" stopColor="#8a7a40" />
          </linearGradient>
          <clipPath id="top-clip">
            <polygon
              points={`${topLeft},10 ${topRight},10 ${midRight},${midY} ${midLeft},${midY}`}
            />
          </clipPath>
          <clipPath id="bot-clip">
            <polygon
              points={`${midLeft},${midY} ${midRight},${midY} ${topLeft + (TOP_W - BOT_W) / 2 + BOT_W},${H - 10} ${topLeft + (TOP_W - BOT_W) / 2},${H - 10}`}
            />
          </clipPath>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer frame — top half */}
        <polygon
          points={`${topLeft},10 ${topRight},10 ${midRight},${midY} ${midLeft},${midY}`}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2"
          opacity="0.5"
        />

        {/* Outer frame — bottom half */}
        <polygon
          points={`${midLeft},${midY} ${midRight},${midY} ${topLeft + (TOP_W - BOT_W) / 2 + BOT_W},${H - 10} ${topLeft + (TOP_W - BOT_W) / 2},${H - 10}`}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2"
          opacity="0.5"
        />

        {/* Top sand (depletes) */}
        <rect
          x={0}
          y={topSandY}
          width={W}
          height={midY - topSandY}
          fill={`url(#${gradId})`}
          opacity="0.25"
          clipPath="url(#top-clip)"
        />

        {/* Bottom sand (accumulates) */}
        <rect
          x={0}
          y={botSandY}
          width={W}
          height={H - botSandY}
          fill={`url(#${gradId})`}
          opacity="0.55"
          clipPath="url(#bot-clip)"
        />

        {/* Neck glow when earning */}
        {isEarning && (
          <ellipse
            cx={W / 2}
            cy={midY}
            rx={NECK}
            ry={4}
            fill="#b8a96a"
            opacity="0.8"
            filter="url(#glow)"
          >
            <animate
              attributeName="opacity"
              values="0.8;0.3;0.8"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </ellipse>
        )}

        {/* Falling particle when earning */}
        {isEarning && (
          <circle cx={W / 2} cy={midY} r={2} fill="#d4c47a" opacity="0.9">
            <animate
              attributeName="cy"
              values={`${midY};${midY + 20}`}
              dur="0.9s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.9;0"
              dur="0.9s"
              repeatCount="indefinite"
            />
          </circle>
        )}

        {/* Gear teeth decorations (4 cardinal points) */}
        {[0, 90, 180, 270].map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const r = 62;
          const cx = W / 2 + r * Math.sin(rad);
          const cy = midY + r * -Math.cos(rad);
          return (
            <rect
              key={i}
              x={cx - 3}
              y={cy - 5}
              width={6}
              height={10}
              rx={1}
              fill={`url(#${gradId})`}
              opacity="0.35"
              transform={`rotate(${angle}, ${cx}, ${cy})`}
            />
          );
        })}

        {/* Center circle */}
        <circle cx={W / 2} cy={midY} r={3} fill={`url(#${gradId})`} opacity="0.7" />
      </svg>

      {/* Labels */}
      <div className="text-center">
        <p className="font-mono text-2xl font-bold text-[#b8a96a]">
          {displayFill.toFixed(1)}%
        </p>
        <p className="text-xs text-white/30">of daily target</p>
      </div>
      <div className="flex flex-col gap-1 text-center">
        <p className="font-mono text-sm font-bold text-green-400">
          ${pendingUsd.toFixed(2)} pending
        </p>
        <p className="font-mono text-xs text-white/25">
          ${dailyUsd.toFixed(2)} / day target
        </p>
      </div>
    </div>
  );
}
