import { useQuery } from "@tanstack/react-query";
import { Table, Td, Th } from "~/components/win95";
import { clustersQuery, hostsQuery } from "~/api/queries";
import { ClusterIcon } from "../tree/nodeIcons";
import { useInventorySelection } from "../selection";
import { relTime } from "../format";
import { DetailHeader } from "./DetailHeader";

export function ClusterDetail({ clusterId }: { clusterId: string }) {
  const clusters = useQuery(clustersQuery());
  const hosts = useQuery(hostsQuery());
  const { select } = useInventorySelection();

  const cluster = clusters.data?.find((c) => c.id === clusterId);
  const clusterHosts = (hosts.data ?? []).filter(
    (h) => h.clusterId === clusterId,
  );

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <DetailHeader
        icon={<ClusterIcon />}
        title={cluster?.name ?? clusterId}
        subtitle={`${clusterHosts.length} host(s) · ${clusterHosts.reduce(
          (n, h) => n + h.vmCount,
          0,
        )} VM(s)`}
      />
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
    </div>
  );
}
