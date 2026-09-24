import * as React from "react";
import type { HostDetail, Vm } from "~/api/types";
import { isClusteredHost } from "../vmActions/storage";
import {
  HostFibreChannelPanel,
  HostNetworkAdaptersPanel,
  HostVirtualSwitchesPanel,
} from "./HostHardwareDetails";
import { SectionList } from "./SectionList";
import { VirtualNetworksPanel } from "./VirtualNetworksPanel";
import { VmStartupOrderingPanel } from "./VmStartupOrderingPanel";

const SECTIONS = [
  { id: "startup", label: "VM Startup Ordering" },
  { id: "nics", label: "Network Adapters" },
  { id: "vswitches", label: "Virtual Switches" },
  { id: "vnets", label: "Virtual Networks" },
  { id: "fc", label: "Fibre Channel Adapters" },
];

/** Host "Configuration" tab: hardware detail + host-scoped settings. */
export function HostConfigurationPanel({
  host,
  vms,
}: {
  host: HostDetail;
  vms: Vm[];
}) {
  const [section, setSection] = React.useState("startup");

  return (
    <SectionList sections={SECTIONS} value={section} onChange={setSection}>
      {section === "startup" ? (
        <VmStartupOrderingPanel vms={vms} clustered={isClusteredHost(host)} />
      ) : null}
      {section === "nics" ? (
        <HostNetworkAdaptersPanel hardware={host.hardware} />
      ) : null}
      {section === "vswitches" ? (
        <HostVirtualSwitchesPanel hardware={host.hardware} />
      ) : null}
      {section === "vnets" ? (
        // a cluster member shares its cluster's VLAN list
        host.clusterId ? (
          <VirtualNetworksPanel clusterId={host.clusterId} />
        ) : (
          <VirtualNetworksPanel hostId={host.id} />
        )
      ) : null}
      {section === "fc" ? <HostFibreChannelPanel hardware={host.hardware} /> : null}
    </SectionList>
  );
}
