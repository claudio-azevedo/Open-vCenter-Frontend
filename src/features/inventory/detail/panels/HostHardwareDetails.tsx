import type { ReactNode } from "react";
import { GroupBox, PropertyList } from "~/components/win95";
import type { HostHardwareInventory } from "~/api/types";
import { bitsPerSec } from "../../format";

/**
 * Per-device hardware detail for the host "Configuration" tab: physical NICs,
 * Hyper-V virtual switches and Fibre Channel HBAs, as the agent last reported.
 */

type Row = { label: string; value: ReactNode };

const dash = (v: ReactNode) => (v === null || v === undefined || v === "" ? "-" : v);
const rows = (items: Row[]) => items.map((r) => ({ ...r, value: dash(r.value) }));
const yesNo = (v: boolean | null | undefined) => (v == null ? "-" : v ? "Yes" : "No");
const mono = (v: string | null | undefined) =>
  v ? <span className="font-mono">{v}</span> : null;

function Empty({ what }: { what: string }) {
  return (
    <p className="text-disabled-text">
      No {what} reported for this host. Use Refresh Hardware to collect them
      (requires an up-to-date agent).
    </p>
  );
}

export function HostNetworkAdaptersPanel({
  hardware,
}: {
  hardware: HostHardwareInventory | null;
}) {
  const nics = hardware?.network ?? [];
  if (!nics.length) return <Empty what="physical network adapters" />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {nics.map((n) => (
        <GroupBox
          key={n.mac || n.name}
          label={`${n.name} - ${n.status || (n.connected ? "Up" : "Disconnected")}`}
        >
          <PropertyList
            items={rows([
              { label: "Model", value: n.description },
              { label: "MAC address", value: mono(n.mac) },
              {
                label: "Link speed",
                value: n.linkSpeed || (n.speedBps ? bitsPerSec(n.speedBps) : null),
              },
              { label: "Driver version", value: n.driverVersion },
              { label: "Driver provider", value: n.driverProvider },
              { label: "Driver date", value: n.driverDate },
              { label: "Firmware version", value: n.firmwareVersion },
            ])}
          />
        </GroupBox>
      ))}
    </div>
  );
}

export function HostVirtualSwitchesPanel({
  hardware,
}: {
  hardware: HostHardwareInventory | null;
}) {
  const switches = hardware?.vSwitches ?? [];
  if (!switches.length) return <Empty what="virtual switches" />;
  return (
    <div className="flex flex-col gap-3">
      {switches.map((s) => (
        <GroupBox key={s.id || s.name} label={`${s.name} - ${s.type || "Unknown"}`}>
          <PropertyList
            items={rows([
              {
                label: "Team members",
                value: s.teamMembers?.length ? s.teamMembers.join(", ") : null,
              },
              { label: "Embedded teaming", value: yesNo(s.embeddedTeaming) },
              { label: "Allow management OS", value: yesNo(s.allowManagementOS) },
              { label: "Load balancing algorithm", value: s.loadBalancingAlgorithm },
              { label: "Bandwidth reservation mode", value: s.bandwidthReservationMode },
              { label: "Uplink adapter", value: s.netAdapter },
              { label: "Switch ID", value: mono(s.id) },
            ])}
          />
        </GroupBox>
      ))}
    </div>
  );
}

export function HostFibreChannelPanel({
  hardware,
}: {
  hardware: HostHardwareInventory | null;
}) {
  const hbas = hardware?.hbas ?? [];
  if (!hbas.length) return <Empty what="Fibre Channel adapters (HBAs)" />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {hbas.map((h, i) => (
        <GroupBox
          key={h.portWWN || `${h.model}-${i}`}
          label={`${h.modelDescription || h.model || `HBA ${i + 1}`}${h.state ? ` - ${h.state}` : ""}`}
        >
          <PropertyList
            items={rows([
              { label: "Manufacturer", value: h.manufacturer },
              { label: "Model", value: h.model },
              { label: "Serial number", value: h.serialNumber },
              { label: "Node WWN", value: mono(h.nodeWWN) },
              { label: "Port WWN", value: mono(h.portWWN) },
              { label: "Speed", value: h.speed },
              { label: "Connection type", value: h.connectionType },
              { label: "Driver version", value: h.driverVersion },
              { label: "Firmware version", value: h.firmwareVersion },
              { label: "Hardware version", value: h.hardwareVersion },
            ])}
          />
        </GroupBox>
      ))}
    </div>
  );
}
