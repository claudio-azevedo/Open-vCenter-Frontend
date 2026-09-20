import { GroupBox, PropertyList } from "~/components/win95";
import type { HostAgentStatus } from "~/api/types";
import { relTime } from "../../format";

export function HostAgentPanel({ agent }: { agent: HostAgentStatus }) {
  return (
    <GroupBox label="Agent">
      <PropertyList
        items={[
          {
            label: "Connection",
            value: agent.connected ? "Connected" : "Disconnected",
          },
          { label: "Version", value: agent.version ?? "-" },
          { label: "Last seen", value: relTime(agent.lastSeen) },
          {
            label: "VM refresh",
            value: agent.refreshIntervals
              ? `${agent.refreshIntervals.vm}s`
              : "-",
          },
          {
            label: "Host refresh",
            value: agent.refreshIntervals
              ? `${agent.refreshIntervals.host}s`
              : "-",
          },
        ]}
      />
    </GroupBox>
  );
}
