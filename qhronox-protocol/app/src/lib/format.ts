/**
 * QhronoX Protocol — Formatting utilities
 */

/** Format QHUBX token amounts with locale commas, 2 decimal places */
export function formatNxs(amount: number, decimals = 2): string {
  if (amount >= 1_000_000_000) return (amount / 1_000_000_000).toFixed(2) + "B";
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(2) + "M";
  if (amount >= 1_000) return (amount / 1_000).toFixed(2) + "K";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format USD values */
export function formatUsd(amount: number, decimals = 2): string {
  if (amount >= 1_000_000) return "$" + (amount / 1_000_000).toFixed(2) + "M";
  if (amount >= 1_000) return "$" + (amount / 1_000).toFixed(2) + "K";
  return "$" + amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a JS Date to "May 8, 2026" */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a unix timestamp */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

/** Shorten a Solana address */
export function shortenAddr(addr: string, chars = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

/** Format seconds into "3d 14h 22m" */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format percentage */
export function formatPct(n: number, decimals = 2): string {
  return n.toFixed(decimals) + "%";
}
