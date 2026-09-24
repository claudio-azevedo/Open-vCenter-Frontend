import type { ReactNode } from "react";
import { GroupBox, PropertyList, Table, Td, Th } from "~/components/win95";
import type { HostHardwareInventory } from "~/api/types";
import {
  bytes,
  dateTime,
  percent,
  uptimeSince,
} from "../../format";

export function HostHardwarePanel({
  hardware,
  leading,
}: {
  hardware: HostHardwareInventory | null;
  /** Optional panel rendered side-by-side with the "System" group box. */
  leading?: ReactNode;
}) {
  if (!hardware) {
    const message = (
      <p className="text-disabled-text">
        No hardware inventory - the host agent has not reported yet.
      </p>
    );
    if (!leading) return message;
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {leading}
        <GroupBox label="System">{message}</GroupBox>
      </div>
    );
  }

  const sys = hardware.system;
  const load = hardware.load;
  const cluster = hardware.cluster;
  const hv = hardware.hyperv;

  const systemItems: Array<{ label: string; value: ReactNode }> = [
    { label: "CPU", value: hardware.cpu.model || "-" },
    {
      label: "CPU Configuration",
      value: `Sockets ${hardware.cpu.sockets} / Cores ${hardware.cpu.cores} / Threads ${hardware.cpu.logical}`,
    },
    { label: "Memory", value: bytes(hardware.memoryBytes) },
    {
      label: "Operating system",
      value: `${hardware.os.caption}${hardware.os.version ? ` (${hardware.os.version})` : ""}`,
    },
  ];
  if (sys && (sys.manufacturer || sys.model)) {
    systemItems.push({
      label: "Machine",
      value: [sys.manufacturer, sys.model].filter(Boolean).join(" "),
    });
  }
  if (hardware.bootTime) {
    systemItems.push({
      label: "Uptime",
      value: `${uptimeSince(hardware.bootTime)} (booted ${dateTime(hardware.bootTime)})`,
    });
  }
  if (load && (load.cpuPercent != null || load.memoryPercent != null)) {
    systemItems.push({
      label: "Load (last refresh)",
      value: `CPU ${percent(load.cpuPercent)} · Memory ${percent(load.memoryPercent)}`,
    });
  }

  const systemGroup = (
    <GroupBox label="System">
      <PropertyList items={systemItems} />
    </GroupBox>
  );

  return (
    <div className="flex flex-col gap-3">
      {leading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {leading}
          {systemGroup}
        </div>
      ) : (
        systemGroup
      )}

      <GroupBox label="Storage">
        <Table>
          <thead>
            <tr>
              <Th>Volume</Th>
              <Th>Total</Th>
              <Th>Free</Th>
            </tr>
          </thead>
          <tbody>
            {hardware.storage.map((s) => (
              <tr key={s.path}>
                <Td>{s.label ? `${s.label} (${s.path})` : s.path}</Td>
                <Td>{bytes(s.totalBytes)}</Td>
                <Td>{bytes(s.freeBytes)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </GroupBox>

      {cluster ? (
        <GroupBox label="Failover Cluster">
          <PropertyList
            items={[
              {
                label: "State",
                value: cluster.clustered
                  ? `${cluster.state}${cluster.name ? ` - ${cluster.name}` : ""}`
                  : cluster.state || "Not clustered",
              },
              ...(cluster.nodes.length
                ? [{ label: "Nodes", value: cluster.nodes.join(", ") }]
                : []),
            ]}
          />
        </GroupBox>
      ) : null}

      {hv && (hv.defaultVmPath || hv.defaultVhdPath) ? (
        <GroupBox label="Hyper-V defaults">
          <PropertyList
            items={[
              { label: "VM path", value: hv.defaultVmPath || "-" },
              { label: "VHD path", value: hv.defaultVhdPath || "-" },
            ]}
          />
        </GroupBox>
      ) : null}

    </div>
  );
}
