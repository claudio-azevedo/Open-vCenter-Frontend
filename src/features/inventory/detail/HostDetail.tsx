import { useQuery } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { Button, GroupBox, Icon, PropertyList, Tabs } from "~/components/win95";
import type { TabItem } from "~/components/win95";
import {
  clustersQuery,
  hostQuery,
  hostVmsQuery,
  hostsQuery,
} from "~/api/queries";
import { HYPERVISOR_LABEL } from "~/api/types";
import { HostIcon } from "../tree/nodeIcons";
import { useInventorySelection } from "../selection";
import { relTime } from "../format";
import { hostConsoleTabUrl } from "./panels/webrdp";
import { DetailHeader } from "./DetailHeader";
import { HostActionsMenu } from "./HostActionsMenu";
import { HostAgentUpdateButton } from "./HostAgentUpdateButton";
import { HostConfigurationPanel } from "./panels/HostConfigurationPanel";
import { HostHardwarePanel } from "./panels/HostHardwarePanel";
import { HostMetricsPanel } from "./panels/HostMetricsPanel";
import { HostSetupAgentPanel } from "./panels/HostSetupAgentPanel";
import { VmGrid } from "./VmGrid";
import { TasksPanel } from "./panels/VmTasksPanel";

// Tabs once the agent has checked in at least once.
const CONNECTED_TABS: TabItem[] = [
  { id: "summary", label: "Summary" },
  { id: "vms", label: "Virtual Machines" },
  { id: "metrics", label: "Host Metrics" },
  { id: "configuration", label: "Configuration" },
  { id: "tasks", label: "Tasks" },
];

// The only tab before that - everything else would be empty anyway.
const SETUP_TABS: TabItem[] = [{ id: "setup", label: "Setup Agent" }];

export function HostDetail({ hostId }: { hostId: string }) {
  const host = useQuery(hostQuery(hostId));
  const hosts = useQuery(hostsQuery());
  const clusters = useQuery(clustersQuery());
  const vms = useQuery(hostVmsQuery(hostId));
  const { tab, setTab } = useInventorySelection();

  if (host.isError) {
    return <div className="p-3 text-disabled-text">Host unavailable.</div>;
  }
  const h = host.data;

  // An agent that has responded even once (online now, or offline but seen
  // before) gets the normal tabs; a host that was never contacted only gets
  // "Setup Agent". Fall back to the (already-loaded) host list so there is no
  // tab flicker while the detail query is in flight.
  const listEntry = hosts.data?.find((x) => x.id === hostId);
  const known = h ?? listEntry;
  const agentResponded = known ? known.agent.lastSeen != null : true;
  const tabs = agentResponded ? CONNECTED_TABS : SETUP_TABS;
  const active = agentResponded
    ? tab && CONNECTED_TABS.some((t) => t.id === tab)
      ? tab
      : "summary"
    : "setup";

  const clusterName = h?.clusterId
    ? (clusters.data?.find((c) => c.id === h.clusterId)?.name ?? h.clusterId)
    : "Standalone";

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <DetailHeader
        icon={<HostIcon online={!!h?.online} />}
        title={h?.name ?? hostId}
        subtitle={h?.fqdn}
        actions={
          <div className="flex gap-1">
            {known ? <HostAgentUpdateButton host={known} /> : null}
            {h && agentResponded ? (
              <HostActionsMenu host={h} vms={vms.data ?? []} />
            ) : null}
            <Button
              className="min-w-0 px-2"
              disabled={!h?.online || !(h?.fqdn ?? h?.ipAddress)}
              title="Open the host's RDP console in a new browser tab"
              onClick={() =>
                window.open(hostConsoleTabUrl(hostId), "_blank", "noopener")
              }
            >
              <Icon icon={Monitor} size={14} />
              Console
            </Button>
          </div>
        }
      />
      <Tabs tabs={tabs} value={active} onChange={setTab} className="flex-1">
        {active === "setup" && known ? (
          <HostSetupAgentPanel host={known} />
        ) : null}
        {active === "summary" && h ? (
          <HostHardwarePanel
            hardware={h.hardware}
            leading={
              <GroupBox label="Host Information">
                <PropertyList
                  items={[
                    { label: "Status", value: h.online ? "Online" : "Offline" },
                    { label: "Cluster", value: clusterName },
                    ...(h.hardware?.cluster?.clustered
                      ? [
                          {
                            label: "Cluster node state",
                            value: h.hardware.cluster.state || "-",
                          },
                        ]
                      : []),
                    {
                      label: "Hypervisor",
                      value: HYPERVISOR_LABEL[h.hypervisor],
                    },
                    { label: "FQDN", value: h.fqdn ?? "-" },
                    { label: "IP address", value: h.ipAddress ?? "-" },
                    // the short handle the agent uses - RabbitMQ queue prefix
                    // and `host_id` in the agent's config.ini (not the DB UUID)
                    { label: "Host ID", value: h.shortId },
                    { label: "Virtual machines", value: h.vmCount },
                    {
                      label: "Agent",
                      value: h.agent.connected ? "Connected" : "Disconnected",
                    },
                    { label: "Agent version", value: h.agent.version ?? "-" },
                    { label: "Last seen", value: relTime(h.agent.lastSeen) },
                  ]}
                />
              </GroupBox>
            }
          />
        ) : null}
        {active === "vms" ? (
          <div className="h-full min-h-[240px]">
            <VmGrid vms={vms.data ?? []} />
          </div>
        ) : null}
        {active === "metrics" ? <HostMetricsPanel hostId={hostId} /> : null}
        {active === "configuration" && h ? (
          <HostConfigurationPanel host={h} vms={vms.data ?? []} />
        ) : null}
        {active === "tasks" ? <TasksPanel hostId={hostId} /> : null}
      </Tabs>
    </div>
  );
}
