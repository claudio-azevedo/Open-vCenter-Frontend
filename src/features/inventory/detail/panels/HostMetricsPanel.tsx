import { useQuery } from '@tanstack/react-query'
import { GroupBox } from '~/components/win95'
import type { HostMetricSample } from '~/api/types'
import { hostMetricsQuery } from '~/api/queries'
import { bytes, percent, relTime } from '../../format'
import { MetricChart } from './MetricChart'

const bytesPerSec = (v: number) => `${bytes(v)}/s`
const ms = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`

const gauge = (
  samples: HostMetricSample[],
  pick: (s: HostMetricSample) => number | null | undefined,
): (number | null)[] => samples.map((s) => pick(s) ?? null)

export function HostMetricsPanel({ hostId }: { hostId: string }) {
  const q = useQuery(hostMetricsQuery(hostId))
  const samples = q.data ?? []

  if (q.isLoading && !q.data) {
    return <p className="text-disabled-text">Loading metrics…</p>
  }

  if (samples.length === 0) {
    return (
      <GroupBox label="Host Metrics">
        <p className="text-disabled-text">
          No samples yet. The host agent posts a metrics sample every few minutes;
          the last hour is kept.
        </p>
      </GroupBox>
    )
  }

  const first = samples[0]
  const latest = samples[samples.length - 1]
  const times = samples.map((s) => s.ts)

  // Memory: prefer bytes-in-use from `detail`, fall back to the percent gauge.
  const memBytes = gauge(samples, (s) => s.detail?.memUsedBytes)
  const hasMemBytes = memBytes.some((v) => v != null)
  const memTotal = Math.max(0, ...samples.map((s) => s.detail?.memTotalBytes ?? 0))

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
              label: 'CPU',
              color: '#008000',
              values: gauge(samples, (s) => s.cpuPercent),
            },
          ]}
        />
      </GroupBox>

      <GroupBox label="Memory">
        <MetricChart
          title="Memory in use"
          times={times}
          yMax={hasMemBytes ? memTotal || undefined : 100}
          format={hasMemBytes ? bytes : (v) => percent(v)}
          series={[
            {
              label: 'Used',
              color: '#000080',
              values: hasMemBytes ? memBytes : gauge(samples, (s) => s.memPercent),
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
              label: 'Receive',
              color: '#008080',
              values: gauge(samples, (s) => s.netRxBps),
            },
            {
              label: 'Send',
              color: '#a000a0',
              values: gauge(samples, (s) => s.netTxBps),
            },
          ]}
        />
      </GroupBox>

      <GroupBox label="Disk">
        <MetricChart
          title="Disk latency"
          times={times}
          format={ms}
          series={[
            {
              label: 'Avg latency',
              color: '#c00000',
              values: gauge(samples, (s) => s.diskLatencyMs),
            },
          ]}
        />
      </GroupBox>
    </div>
  )
}
