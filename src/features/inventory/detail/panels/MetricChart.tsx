import * as React from "react";
import { clock } from "../../format";

export type MetricSeries = {
  label: string;
  color: string;
  /** one value per sample; `null` breaks the line (gap / counter reset). */
  values: (number | null)[];
};

type Props = {
  title: string;
  series: MetricSeries[];
  /** ISO timestamp per sample (same length as each series' `values`). */
  times: string[];
  /** fixed y-axis max (e.g. 100 for a percentage); omitted → auto-scaled. */
  yMax?: number;
  /** horizontal gridline / label rows, default 4. */
  rows?: number;
  /** formats a y value for the axis labels, legend and hover readout. */
  format: (v: number) => string;
  height?: number;
};

/** "nice" upper bound ≥ m from the 1 / 2 / 2.5 / 5 · 10ⁿ ladder. */
function niceMax(m: number): number {
  if (!isFinite(m) || m <= 0) return 1;
  const exp = Math.floor(Math.log10(m));
  const base = 10 ** exp;
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * base >= m) return step * base;
  }
  return 10 * base;
}

/**
 * A flat, square line chart in the Win95 Performance Monitor idiom: a sunken
 * white well with horizontal gridlines, crisp 1px coloured lines, a time axis,
 * and a hover crosshair that reads out the sample under the cursor. Pure inline
 * SVG - no chart library.
 *
 * The SVG draws in a 0-100 square with `preserveAspectRatio="none"` so it
 * stretches to any width; `vector-effect="non-scaling-stroke"` keeps strokes
 * 1-ish px regardless. All text is real HTML so it never distorts.
 */
export function MetricChart({
  title,
  series,
  times,
  yMax,
  rows = 4,
  format,
  height = 132,
}: Props) {
  const n = Math.max(...series.map((s) => s.values.length), 0);
  const [hover, setHover] = React.useState<number | null>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);

  const dataMax = Math.max(
    0,
    ...series.flatMap((s) =>
      s.values.filter((v): v is number => v != null && isFinite(v)),
    ),
  );
  const top = yMax ?? (niceMax(dataMax) || 1);

  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - Math.min(1, Math.max(0, v / top)) * 100;

  // split each series into gap-free segments so nulls break the line
  const segmentsFor = (s: MetricSeries): string[] => {
    const segs: string[] = [];
    let cur: string[] = [];
    s.values.forEach((v, i) => {
      if (v == null || !isFinite(v)) {
        if (cur.length > 1) segs.push(cur.join(" "));
        cur = [];
        return;
      }
      cur.push(`${x(i).toFixed(2)},${y(v).toFixed(2)}`);
    });
    if (cur.length > 1) segs.push(cur.join(" "));
    return segs;
  };

  const gridY = Array.from({ length: rows + 1 }, (_, i) => (i / rows) * 100);
  const hasLine = series.some((s) => segmentsFor(s).length > 0);

  // evenly spaced sample indices for the x-axis time ticks
  const tickCount = Math.min(4, n);
  const xTicks =
    tickCount <= 1
      ? n === 1
        ? [0]
        : []
      : Array.from({ length: tickCount }, (_, k) =>
          Math.round((k * (n - 1)) / (tickCount - 1)),
        );

  const last = (s: MetricSeries): number | null => {
    for (let i = s.values.length - 1; i >= 0; i--) {
      const v = s.values[i];
      if (v != null && isFinite(v)) return v;
    }
    return null;
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (n === 0 || !plotRef.current) return;
    const r = plotRef.current.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };

  const hoverFrac = hover != null && n > 1 ? hover / (n - 1) : 0;

  return (
    <figure className="m-0 flex flex-col gap-1">
      <figcaption className="text-base font-bold">{title}</figcaption>
      <div className="flex gap-1">
        <div
          className="flex w-11 shrink-0 flex-col justify-between text-right text-xs text-disabled-text"
          style={{ height }}
        >
          {gridY.map((g) => (
            <span key={g} className="leading-none">
              {format((top * (100 - g)) / 100)}
            </span>
          ))}
        </div>
        <div
          ref={plotRef}
          className="bevel-sunken bg-window relative flex-1"
          style={{ height }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {gridY.map((g) => (
              <line
                key={`h${g}`}
                x1="0"
                y1={g}
                x2="100"
                y2={g}
                stroke="var(--color-bevel-dark)"
                strokeWidth="1"
                strokeDasharray={g === 100 ? undefined : "2 2"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {xTicks.map((i) => (
              <line
                key={`v${i}`}
                x1={x(i)}
                y1="0"
                x2={x(i)}
                y2="100"
                stroke="var(--color-bevel-dark)"
                strokeWidth="1"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {series.flatMap((s, si) =>
              segmentsFor(s).map((pts, pi) => (
                <polyline
                  key={`${si}-${pi}`}
                  points={pts}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )),
            )}
            {hover != null ? (
              <line
                x1={x(hover)}
                y1="0"
                x2={x(hover)}
                y2="100"
                stroke="var(--color-bevel-darker)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          {hover != null ? (
            <div
              className="bevel-raised bg-surface pointer-events-none absolute top-1 z-10 whitespace-nowrap p-1 text-xs"
              style={{
                left: `${hoverFrac * 100}%`,
                transform:
                  hoverFrac > 0.6 ? "translateX(-100%)" : "translateX(0)",
                marginLeft: hoverFrac > 0.6 ? -4 : 4,
              }}
            >
              <div className="font-bold">{clock(times[hover], true)}</div>
              {series.map((s) => {
                const v = s.values[hover];
                return (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 border border-bevel-dark"
                      style={{ background: s.color }}
                    />
                    {s.label}
                    <span className="text-disabled-text">
                      {v != null && isFinite(v) ? format(v) : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!hasLine ? (
            <div className="absolute inset-0 grid place-items-center text-xs text-disabled-text">
              not enough data yet
            </div>
          ) : null}
        </div>
      </div>

      {/* x-axis time labels, aligned to the vertical gridlines */}
      <div className="relative ml-12 h-3.5 text-xs text-disabled-text">
        {xTicks.map((i, k) => (
          <span
            key={i}
            className="absolute leading-none"
            style={{
              left: `${x(i)}%`,
              transform:
                k === 0
                  ? "translateX(0)"
                  : k === xTicks.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {clock(times[i])}
          </span>
        ))}
      </div>

      <div className="ml-12 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
        {series.map((s) => {
          const v = last(s);
          return (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 border border-bevel-dark"
                style={{ background: s.color }}
              />
              {s.label}
              {v != null ? (
                <span className="text-disabled-text">· {format(v)}</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </figure>
  );
}
