import { cn } from "./bevel";

/**
 * Classic Win95 progress bar with a solid fill. `value` is 0–100; pass
 * `indeterminate` for a queued/unknown state (renders an empty well).
 *
 * `tone`:
 *   - `active` (default) - blue fill, an operation in progress.
 *   - `muted` - light-grey fill, a finished/inactive bar (succeeded or failed);
 *     pair it with `value={100}`.
 */
export function ProgressBar({
  value,
  indeterminate = false,
  tone = "active",
  className,
}: {
  value: number;
  indeterminate?: boolean;
  tone?: "active" | "muted";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("bevel-sunken h-[16px] bg-window p-[2px]", className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminate ? null : (
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            backgroundColor:
              tone === "muted"
                ? "var(--color-surface)"
                : "var(--color-title-active)",
          }}
        />
      )}
    </div>
  );
}
