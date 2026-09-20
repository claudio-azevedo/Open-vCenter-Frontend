import { useQuery } from "@tanstack/react-query";
import { Button, PropertyList } from "~/components/win95";
import { clustersQuery, hostsQuery, templatesQuery } from "~/api/queries";
import { TemplateIcon } from "../tree/nodeIcons";
import { organizeDialog } from "../organize/dialogStore";
import { bytes, dateTime } from "../format";
import { DetailHeader } from "./DetailHeader";

export function TemplateDetail({ templateId }: { templateId: string }) {
  const templates = useQuery(templatesQuery());
  const hosts = useQuery(hostsQuery());
  const clusters = useQuery(clustersQuery());

  const t = templates.data?.find((x) => x.id === templateId);
  if (templates.data && !t) {
    return <div className="p-3 text-disabled-text">Template not found.</div>;
  }

  const host = hosts.data?.find((h) => h.id === t?.hostId);
  const cluster = host?.clusterId
    ? clusters.data?.find((c) => c.id === host.clusterId)
    : undefined;
  const location = [cluster?.name, host?.name ?? t?.hostId]
    .filter(Boolean)
    .join(" › ");

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <DetailHeader
        icon={<TemplateIcon />}
        title={t?.name ?? templateId}
        subtitle={location}
        actions={
          <Button
            className="min-w-0 px-2"
            disabled={!t}
            onClick={() =>
              t &&
              organizeDialog.open({
                kind: "new-vm",
                mode: "template",
                templateId: t.id,
              })
            }
          >
            Deploy new VM…
          </Button>
        }
      />
      <PropertyList
        items={[
          { label: "Guest OS", value: t?.guestOs ?? "-" },
          { label: "vCPUs", value: t?.cpuCount || "-" },
          {
            label: "Memory",
            value: t?.memoryMb ? `${(t.memoryMb / 1024).toFixed(1)} GB` : "-",
          },
          { label: "Provisioned size", value: bytes(t?.sizeBytes) },
          { label: "Size on disk", value: bytes(t?.diskSizeBytes) },
          { label: "Exported", value: dateTime(t?.createdAt) },
          {
            label: "Path",
            value: <span className="break-all">{t?.path ?? "-"}</span>,
          },
        ]}
      />
      <div className="flex flex-col gap-1 text-base">
        <span className="text-disabled-text">Notes</span>
        <p className="bevel-sunken min-h-[3rem] whitespace-pre-wrap bg-window px-1.5 py-1">
          {t?.notes || <span className="text-disabled-text">-</span>}
        </p>
      </div>
    </div>
  );
}
