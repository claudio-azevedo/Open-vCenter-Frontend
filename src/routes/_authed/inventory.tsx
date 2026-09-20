import { createFileRoute } from "@tanstack/react-router";
import { clustersQuery, hostsQuery, vmsQuery } from "~/api/queries";
import { InventoryExplorer } from "~/features/inventory/InventoryExplorer";
import { validateInventorySearch } from "~/features/inventory/selection";

export const Route = createFileRoute("/_authed/inventory")({
  validateSearch: validateInventorySearch,
  loader: async ({ context }) => {
    const { queryClient } = context;
    await Promise.all([
      queryClient.ensureQueryData(clustersQuery()),
      queryClient.ensureQueryData(hostsQuery()),
      queryClient.ensureQueryData(vmsQuery()),
    ]).catch(() => {
      // Backend may be down - the Explorer renders a disconnected state.
    });
  },
  component: InventoryExplorer,
});
