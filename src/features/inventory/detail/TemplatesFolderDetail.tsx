import { useQuery } from "@tanstack/react-query";
import { PropertyList, Table, Td, Th } from "~/components/win95";
import { clustersQuery, hostsQuery, templatesQuery } from "~/api/queries";
import { FolderIcon } from "../tree/nodeIcons";
import { useInventorySelection } from "../selection";
import { bytes, dateTime } from "../format";
import { DetailHeader } from "./DetailHeader";

/** `scope` is the templatefolder selection id: "host:<id>" or "cluster:<id>". */
export function TemplatesFolderDetail({ scope }: { scope: string }) {
  const [scopeKind, ...rest] = scope.split(":");
  const scopeId = rest.join(":");

  const templates = useQuery(templatesQuery());
  const hosts = useQuery(hostsQuery());
  const clusters = useQuery(clustersQuery());
  const { select } = useInventorySelection();

  const hostById = new Map((hosts.data ?? []).map((h) => [h.id, h]));
  const scopeHostIds = new Set(
    scopeKind === "cluster"
      ? (hosts.data ?? [])
          .filter((h) => h.clusterId === scopeId)
          .map((h) => h.id)
      : [scopeId],
  );
  const rows = (templates.data ?? [])
    .filter((t) => scopeHostIds.has(t.hostId))
    .sort((a, b) => a.name.localeCompare(b.name));

  const scopeName =
    scopeKind === "cluster"
      ? (clusters.data?.find((c) => c.id === scopeId)?.name ?? scopeId)
      : (hostById.get(scopeId)?.name ?? scopeId);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <DetailHeader
        icon={<FolderIcon />}
        title="Templates"
        subtitle={`${scopeKind === "cluster" ? "Cluster" : "Host"}: ${scopeName}`}
      />
      <PropertyList items={[{ label: "Templates", value: rows.length }]} />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            {scopeKind === "cluster" ? <Th>Host</Th> : null}
            <Th>Guest OS</Th>
            <Th className="text-right">vCPU</Th>
            <Th className="text-right">RAM</Th>
            <Th className="text-right">Provisioned</Th>
            <Th className="text-right">On disk</Th>
            <Th>Exported</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              className="cursor-default hover:bg-surface-2"
              onClick={() => select({ kind: "template", id: t.id })}
            >
              <Td>{t.name}</Td>
              {scopeKind === "cluster" ? (
                <Td>{hostById.get(t.hostId)?.name ?? t.hostId}</Td>
              ) : null}
              <Td>{t.guestOs ?? "-"}</Td>
              <Td className="text-right">{t.cpuCount || "-"}</Td>
              <Td className="text-right">
                {t.memoryMb ? `${(t.memoryMb / 1024).toFixed(1)} GB` : "-"}
              </Td>
              <Td className="text-right">{bytes(t.sizeBytes)}</Td>
              <Td className="text-right">{bytes(t.diskSizeBytes)}</Td>
              <Td>{dateTime(t.createdAt)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
