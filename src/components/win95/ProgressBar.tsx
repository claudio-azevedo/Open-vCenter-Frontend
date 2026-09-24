import { cn } from "./bevel";

/**
 * Progress bar with a solid fill. `value` is 0–100; pass
 * `indeterminate` for a queued/unknown state (renders an empty well).
 *
 * `tone`:
 *   - `active` (default) - theme fill, an operation in progress.
 *   - `muted` - neutral fill, a finished/inactive bar (succeeded or failed);
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
      className={cn("ui-progress h-[16px]", className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminate ? null : (
        <div
          className="ui-progress-fill h-full"
          data-tone={tone}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
