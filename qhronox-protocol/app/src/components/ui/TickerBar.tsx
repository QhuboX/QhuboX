"use client";

import { useEffect, useState } from "react";
import { useStaking } from "@/hooks/useStaking";
import { formatNxs, formatUsd } from "@/lib/format";

interface Tick {
  label: string;
  value: string;
  change?: string;
  changeUp?: boolean;
}

export default function TickerBar() {
  const { pool, qhubxPrice } = useStaking();
  const [prevPrice, setPrevPrice] = useState(qhubxPrice);
  const [priceUp, setPriceUp] = useState(true);

  useEffect(() => {
    if (qhubxPrice !== prevPrice) {
      setPriceUp(qhubxPrice >= prevPrice);
      setPrevPrice(qhubxPrice);
    }
  }, [qhubxPrice, prevPrice]);

  // 24h reward estimate: totalFees / 30d average * 70% staker share
  const daily24h = pool ? (pool.totalFeesCollected / 30) * 0.7 : 0;
  const vol24h = pool ? pool.totalFeesCollected / 30 : 0;

  const ticks: Tick[] = [
    {
      label: "QHUBX/USD",
      value: qhubxPrice > 0 ? `$${qhubxPrice.toFixed(4)}` : "—",
      change: qhubxPrice > 0 ? (priceUp ? "▲" : "▼") : undefined,
      changeUp: priceUp,
    },
    {
      label: "24h Vol",
      value: vol24h > 0 ? formatUsd(vol24h) : "—",
    },
    {
      label: "TVL",
      value: pool ? formatNxs(pool.totalStaked) + " QHUBX" : "—",
    },
    {
      label: "Rewards 24h",
      value: daily24h > 0 ? formatNxs(daily24h) + " QHUBX" : "—",
      changeUp: true,
    },
    {
      label: "Burned",
      value: pool ? formatNxs(pool.totalBurned) + " QHUBX" : "—",
    },
    {
      label: "Transfer fee",
      value: "3%",
    },
  ];

  return (
    <div className="flex items-center gap-6 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 font-mono text-[11px] scrollbar-none">
      {ticks.map((tick, i) => (
        <div key={tick.label} className="flex shrink-0 items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="text-white/25">{tick.label}</span>
            <span className="font-bold text-white">{tick.value}</span>
            {tick.change && (
              <span className={tick.changeUp ? "text-green-400" : "text-red-400"}>
                {tick.change}
              </span>
            )}
          </div>
          {i < ticks.length - 1 && (
            <span className="text-white/10">|</span>
          )}
        </div>
      ))}
    </div>
  );
}
