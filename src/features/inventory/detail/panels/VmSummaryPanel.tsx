import { useQuery } from "@tanstack/react-query";
import { HardDrive, Network } from "lucide-react";
import {
  Button,
  GroupBox,
  Icon,
  PropertyList,
  Table,
  Td,
  Th,
} from "~/components/win95";
import type { Vm } from "~/api/types";
import { foldersQuery, hostQuery } from "~/api/queries";
import { bytes, dateTime, duration, percent, relTime } from "../../format";
import { vmActionDialog } from "../vmActions/dialogStore";

export function VmSummaryPanel({ vm }: { vm: Vm }) {
  const folders = useQuery(foldersQuery({}));
  const host = useQuery({ ...hostQuery(vm.hostId), enabled: !!vm.hostId });
  const inCluster = !!host.data?.clusterId;
  const hostOffline = host.isSuccess && !host.data.online;
  const folderName = vm.folderId
    ? (folders.data?.find((f) => f.id === vm.folderId)?.name ?? vm.folderId)
    : "None";

  const memory = vm.memory.dynamic
    ? `${bytes(vm.memory.assignedBytes)} (dynamic ${bytes(vm.memory.minBytes)}–${bytes(vm.memory.maxBytes)})`
    : `${bytes(vm.memory.assignedBytes)} (static)`;

  const autoStart =
    vm.autoStartAction && vm.autoStartAction !== "Nothing"
      ? vm.autoStartDelaySec
        ? `${vm.autoStartAction} (+${vm.autoStartDelaySec}s)`
        : vm.autoStartAction
      : "Nothing";

  return (
    <div className="flex flex-col gap-3">
      {hostOffline ? (
        <div className="bevel-thin-sunken bg-window px-2 py-1.5 text-[#8a6d00]">
          Host <strong>{host.data?.name}</strong> agent is offline
          {host.data?.agent.lastSeen
            ? ` (last seen ${relTime(host.data.agent.lastSeen)})`
            : ""}
          . This VM's state is unknown and power actions are unavailable until
          the host reconnects.
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <GroupBox label="Virtual Machine Information">
          <PropertyList
            items={[
              { label: "State", value: vm.state },
              { label: "Last seen", value: relTime(vm.lastSeen) },
              { label: "Firmware", value: vm.firmware },
              { label: "Uptime", value: duration(vm.uptimeSec) },
              { label: "Created", value: dateTime(vm.createdAt) },
              { label: "Folder", value: folderName },
              { label: "VM GUID", value: vm.vmUuid ?? "-" },
            ]}
          />
        </GroupBox>
        <GroupBox label="Configuration">
          <PropertyList
            items={[
              { label: "CPU", value: `${vm.vcpu} vCPUs` },
              { label: "CPU usage", value: percent(vm.cpuUsagePercent) },
              { label: "Memory", value: memory },
              {
                label: "Memory demand",
                value: bytes(vm.memory.demandBytes),
              },
              { label: "Disks", value: vm.disks.length },
              { label: "Network adapters", value: vm.nics.length },
            ]}
          />
        </GroupBox>
      </div>

      <GroupBox label="Advanced">
        <div className="grid gap-3 md:grid-cols-2">
          <PropertyList
            items={[
              {
                label: "Secure Boot",
                value:
                  vm.firmware === "BIOS"
                    ? "Not supported"
                    : vm.secureBoot == null
                      ? "-"
                      : vm.secureBoot
                        ? `On${vm.secureBootTemplate ? ` (${vm.secureBootTemplate})` : ""}`
                        : "Off",
              },
              {
                label: "Nested virtualization",
                value: vm.nestedVirtualization ? "Enabled" : "Disabled",
              },
              // HA is a cluster-only concept - omit it on a standalone host
              ...(inCluster
                ? [
                    {
                      label: "High availability",
                      value: vm.highlyAvailable ? "Enabled" : "Disabled",
                    },
                  ]
                : []),
            ]}
          />
          <PropertyList
            items={[
              { label: "Automatic start", value: autoStart },
              { label: "Automatic stop", value: vm.autoStopAction ?? "-" },
              { label: "Mounted ISO", value: vm.dvdPath ?? "None" },
              { label: "Config path", value: vm.configPath ?? "-" },
            ]}
          />
        </div>
      </GroupBox>

      <GroupBox label="Notes">
        <textarea
          readOnly
          value={vm.notes ?? ""}
          rows={5}
          placeholder="No notes"
          className="bevel-sunken bg-window w-full resize-none px-1.5 py-[3px] text-base text-black outline-none"
        />
      </GroupBox>

      {vm.nics.length ? (
        <GroupBox label="Network adapters">
          <div className="mb-2 flex justify-end">
            <Button
              className="min-w-0 px-2"
              disabled={!!vm.lock}
              onClick={() =>
                vmActionDialog.open({
                  kind: "edit",
                  vmId: vm.id,
                  tab: "network",
                })
              }
            >
              <Icon icon={Network} size={14} />
              Edit Network…
            </Button>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Virtual switch</Th>
                <Th>VLAN</Th>
                <Th>MAC</Th>
                <Th>IP addresses</Th>
              </tr>
            </thead>
            <tbody>
              {vm.nics.map((n) => (
                <tr key={n.id}>
                  <Td>{n.name}</Td>
                  <Td>{n.switchName || "-"}</Td>
                  <Td>{n.vlanId ? n.vlanId : "-"}</Td>
                  <Td>{n.macAddress}</Td>
                  <Td>{n.ipAddresses.join(", ") || "-"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </GroupBox>
      ) : null}

      {vm.disks.length ? (
        <GroupBox label="Disks">
          <div className="mb-2 flex justify-end">
            <Button
              className="min-w-0 px-2"
              disabled={!!vm.lock}
              onClick={() =>
                vmActionDialog.open({ kind: "edit", vmId: vm.id, tab: "disks" })
              }
            >
              <Icon icon={HardDrive} size={14} />
              Edit Disks…
            </Button>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Path</Th>
                <Th>Controller</Th>
                <Th>Type</Th>
                <Th>Format</Th>
                <Th>Size</Th>
                <Th>Used</Th>
              </tr>
            </thead>
            <tbody>
              {vm.disks.map((d) => (
                <tr key={d.id}>
                  <Td className="font-[inherit]">{d.path}</Td>
                  <Td>{d.controller || "-"}</Td>
                  <Td>{d.type || "-"}</Td>
                  <Td>{d.format || "-"}</Td>
                  <Td>{bytes(d.sizeBytes)}</Td>
                  <Td>{bytes(d.usedBytes)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </GroupBox>
      ) : null}
    </div>
  );
}
