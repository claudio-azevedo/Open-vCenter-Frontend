export function bytes(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(n) / Math.log(1024)),
  );
  const val = n / 1024 ** i;
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function bitsPerSec(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n >= 1e9) return `${(n / 1e9).toFixed(0)} Gbps`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} Mbps`;
  return `${n} bps`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

export function dateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "-";
}

/** Compact date + 24h time, e.g. "05 Sep 17:30" - for narrow table columns. */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Coarse uptime ("12d 4h") from a boot timestamp. */
export function uptimeSince(iso: string | null | undefined): string {
  if (!iso) return "-";
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  return secs > 0 ? duration(secs) : "-";
}

export function percent(n: number | null | undefined): string {
  return n == null ? "-" : `${Math.round(n)}%`;
}

export function timeOnly(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleTimeString() : "-";
}

/** Short 24h wall-clock, "15:04" (or "15:04:32" with seconds). */
export function clock(iso: string | null | undefined, seconds = false): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hour12: false,
  });
}
