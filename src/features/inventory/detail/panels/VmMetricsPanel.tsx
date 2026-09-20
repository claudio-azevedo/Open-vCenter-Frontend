import { useQuery } from "@tanstack/react-query";
import { GroupBox } from "~/components/win95";
import type { Vm, VmMetricSample } from "~/api/types";
import { vmMetricsQuery } from "~/api/queries";
import { bytes, percent, relTime } from "../../format";
import { MetricChart } from "./MetricChart";

const bytesPerSec = (v: number) => `${bytes(v)}/s`;

/** Per-interval rate of a cumulative counter (bytes) → bytes/sec. */
function rateSeries(
  samples: VmMetricSample[],
  pick: (s: VmMetricSample) => number | null,
): (number | null)[] {
  return samples.map((s, i) => {
    if (i === 0) return null;
    const prev = samples[i - 1];
    const cur = pick(s);
    const before = pick(prev);
    if (cur == null || before == null) return null;
    const dt = (Date.parse(s.ts) - Date.parse(prev.ts)) / 1000;
    if (!(dt > 0)) return null;
    const delta = cur - before;
    if (delta < 0) return null; // metering reset - drop this point
    return delta / dt;
  });
}

const gauge = (
  samples: VmMetricSample[],
  pick: (s: VmMetricSample) => number | null,
) => samples.map(pick);

export function VmMetricsPanel({ vm }: { vm: Vm }) {
  const q = useQuery(vmMetricsQuery(vm.id));
  const samples = q.data ?? [];

  if (q.isLoading && !q.data) {
    return <p className="text-disabled-text">Loading metrics…</p>;
  }

  if (samples.length === 0) {
    return (
      <GroupBox label="VM Metrics">
        <p className="text-disabled-text">
          No samples yet. The host agent posts a metering sample every few
          minutes while metrics are enabled; the last hour is kept.
        </p>
      </GroupBox>
    );
  }

  const first = samples[0];
  const latest = samples[samples.length - 1];
  const times = samples.map((s) => s.ts);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-disabled-text">
        {samples.length} samples · {relTime(first.ts)} → {relTime(latest.ts)}
      </p>

      <GroupBox label="Processor">
        <MetricChart
          title="CPU usage"
          times={times}
          yMax={100}
          format={(v) => percent(v)}
          series={[
            {
              label: "CPU",
              color: "#008000",
              values: gauge(samples, (s) => s.cpuPercent),
            },
          ]}
        />
      </GroupBox>

      <GroupBox label="Memory">
        <MetricChart
          title="Memory in use"
          times={times}
          format={bytes}
          series={[
            {
              label: "Used",
              color: "#000080",
              values: gauge(samples, (s) => s.memBytes),
            },
          ]}
        />
      </GroupBox>

      <GroupBox label="Network">
        <MetricChart
          title="Network throughput"
          times={times}
          format={bytesPerSec}
          series={[
            {
              label: "Receive",
              color: "#008080",
              values: rateSeries(samples, (s) => s.netRxBytes),
            },
            {
              label: "Send",
              color: "#a000a0",
              values: rateSeries(samples, (s) => s.netTxBytes),
            },
          ]}
        />
      </GroupBox>

      <GroupBox label="Disk">
        <MetricChart
          title="Disk throughput"
          times={times}
          format={bytesPerSec}
          series={[
            {
              label: "Disk I/O",
              color: "#c00000",
              values: rateSeries(samples, (s) => s.diskBytes),
            },
          ]}
        />
      </GroupBox>
    </div>
  );
}
