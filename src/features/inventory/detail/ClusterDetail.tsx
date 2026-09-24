import { useQuery } from "@tanstack/react-query";
import { Table, Tabs, Td, Th } from "~/components/win95";
import type { TabItem } from "~/components/win95";
import { clustersQuery, hostsQuery, vmsQuery } from "~/api/queries";
import { ClusterIcon } from "../tree/nodeIcons";
import { useInventorySelection } from "../selection";
import { relTime } from "../format";
import { DetailHeader } from "./DetailHeader";
import { VirtualNetworksPanel } from "./panels/VirtualNetworksPanel";
import { VmStartupOrderingPanel } from "./panels/VmStartupOrderingPanel";

const TABS: TabItem[] = [
  { id: "hosts", label: "Hosts" },
  { id: "startup", label: "VM Startup Ordering" },
  { id: "vnets", label: "Virtual Networks" },
];

export function ClusterDetail({ clusterId }: { clusterId: string }) {
  const clusters = useQuery(clustersQuery());
  const hosts = useQuery(hostsQuery());
  const { select, tab, setTab } = useInventorySelection();
  const active = tab && TABS.some((t) => t.id === tab) ? tab : "hosts";
  const vms = useQuery({ ...vmsQuery(), enabled: active === "startup" });

  const cluster = clusters.data?.find((c) => c.id === clusterId);
  const clusterHosts = (hosts.data ?? []).filter(
    (h) => h.clusterId === clusterId,
  );
  const hostIds = new Set(clusterHosts.map((h) => h.id));
  const clusterVms = (vms.data ?? []).filter((v) => hostIds.has(v.hostId));

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <DetailHeader
        icon={<ClusterIcon />}
        title={cluster?.name ?? clusterId}
        subtitle={`${clusterHosts.length} host(s) · ${clusterHosts.reduce(
          (n, h) => n + h.vmCount,
          0,
        )} VM(s)`}
      />
      <Tabs tabs={TABS} value={active} onChange={setTab} className="flex-1">
        {active === "hosts" ? (
          <Table>
            <thead>
              <tr>
                <Th>Host</Th>
                <Th>FQDN</Th>
                <Th>Status</Th>
                <Th>Agent</Th>
                <Th>VMs</Th>
              </tr>
            </thead>
            <tbody>
              {clusterHosts.map((h) => (
                <tr
                  key={h.id}
                  className="cursor-default hover:bg-surface-2"
                  onClick={() => select({ kind: "host", id: h.id })}
                >
                  <Td>{h.name}</Td>
                  <Td>{h.fqdn ?? "-"}</Td>
                  <Td>{h.online ? "Online" : "Offline"}</Td>
                  <Td>
                    {h.agent.connected
                      ? `v${h.agent.version} · ${relTime(h.agent.lastSeen)}`
                      : "Disconnected"}
                  </Td>
                  <Td>{h.vmCount}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {active === "startup" ? (
          vms.isLoading ? (
            <p className="text-disabled-text">Loading…</p>
          ) : (
            <VmStartupOrderingPanel vms={clusterVms} clustered />
          )
        ) : null}
        {active === "vnets" ? <VirtualNetworksPanel clusterId={clusterId} /> : null}
      </Tabs>
    </div>
  );
}
