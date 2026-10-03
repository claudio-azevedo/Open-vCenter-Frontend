import { EventsTable } from "../../events/EventsTable";

/** The Events tab (admin only): audit events of a VM, or of a host / cluster
 *  and everything that was on it. */
export function EventsPanel(
  props: { vmId: string } | { hostId: string } | { clusterId: string },
) {
  if ("vmId" in props) {
    return (
      <EventsTable
        params={{ targetType: "vm", targetId: props.vmId }}
        hideType
        emptyText="No events recorded for this VM."
      />
    );
  }
  if ("hostId" in props) {
    return (
      <EventsTable
        params={{ hostId: props.hostId }}
        emptyText="No events recorded for this host or its VMs."
      />
    );
  }
  return (
    <EventsTable
      params={{ clusterId: props.clusterId }}
      emptyText="No events recorded for this cluster, its hosts or VMs."
    />
  );
}
