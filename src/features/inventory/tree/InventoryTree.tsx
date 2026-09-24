import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, MonitorUp, Network, RefreshCw, Server } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, Icon, TreeView } from "~/components/win95";
import {
  clustersQuery,
  foldersQuery,
  hostsQuery,
  templatesQuery,
  vmsQuery,
} from "~/api/queries";
import { useInventorySelection } from "../selection";
import { statusMessage } from "../actions/statusMessage";
import { organizeDialog } from "../organize/dialogStore";
import { useNewVmTarget } from "../useNewVmTarget";
import { useTreeBehavior } from "~/preferences";
import {
  buildInventoryTree,
  initialExpansion,
  nodeIdToSelection,
  selectionToNodeId,
} from "./treeModel";

function TreeToolButton({
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className="min-h-0 min-w-0 px-1.5 py-[2px]"
    >
      <Icon icon={icon} size={13} />
    </Button>
  );
}

export function InventoryTree() {
  const queryClient = useQueryClient();
  const { selection, select } = useInventorySelection();
  const { target: newVmTarget, hasOnlineHost, folderScope } = useNewVmTarget();

  const clusters = useQuery(clustersQuery());
  const hosts = useQuery(hostsQuery());
  const folders = useQuery(foldersQuery({}));
  const vms = useQuery(vmsQuery());
  const templates = useQuery(templatesQuery());

  const nodes = React.useMemo(
    () =>
      buildInventoryTree({
        clusters: clusters.data ?? [],
        hosts: hosts.data ?? [],
        folders: folders.data ?? [],
        vms: vms.data ?? [],
        templates: templates.data ?? [],
      }),
    [clusters.data, hosts.data, folders.data, vms.data, templates.data],
  );

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const { treeBehavior } = useTreeBehavior();
  const selectedId = selectionToNodeId(selection);

  // Seed the expansion on the first populated render, and again whenever the
  // user switches Preferences › Tree Behavior - but not on every data refetch,
  // which would undo the user's manual expand/collapse.
  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!nodes.length || seededFor.current === treeBehavior) return;
    seededFor.current = treeBehavior;
    setExpanded(initialExpansion(nodes, treeBehavior, selectedId));
    // selectedId is read at seeding time only: selecting a node later must not
    // re-seed the tree.
  }, [nodes, treeBehavior]);

  const loading = clusters.isLoading || hosts.isLoading || vms.isLoading;
  const failed = clusters.isError && hosts.isError && !nodes.length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-[2px] flex items-center gap-1 border-b border-fg/20 bg-surface px-1 py-[2px]">
        <TreeToolButton
          icon={RefreshCw}
          label="Refresh"
          onClick={() => {
            statusMessage.set("Refreshing inventory…");
            for (const k of ["clusters", "hosts", "vms", "folders", "vlans"]) {
              queryClient.invalidateQueries({ queryKey: [k] });
            }
          }}
        />
        <TreeToolButton
          icon={MonitorUp}
          label="New VM"
          disabled={!hasOnlineHost}
          title={
            hasOnlineHost
              ? undefined
              : "No online host available to create a VM on"
          }
          onClick={() => organizeDialog.open({ kind: "new-vm", ...newVmTarget })}
        />
        <TreeToolButton
          icon={Network}
          label="New Cluster"
          onClick={() => organizeDialog.open({ kind: "cluster-management" })}
        />
        <TreeToolButton
          icon={Server}
          label="New Host"
          onClick={() => organizeDialog.open({ kind: "host-management" })}
        />
        {selection?.kind === "host" && folderScope ? (
          <TreeToolButton
            icon={FolderPlus}
            label="New Folder"
            onClick={() =>
              organizeDialog.open({ kind: "new-folder", ...folderScope })
            }
          />
        ) : null}
      </div>
      {failed ? (
        <div className="bevel-sunken flex-1 bg-window p-3 text-disabled-text">
          No clusters - backend unavailable.
        </div>
      ) : loading && !nodes.length ? (
        <div className="bevel-sunken flex-1 bg-window p-3 text-disabled-text">
          Loading inventory…
        </div>
      ) : (
        <TreeView
          nodes={nodes}
          selectedId={selectedId}
          expandedIds={expanded}
          onSelect={(id) => select(nodeIdToSelection(id))}
          onToggle={(id) =>
            setExpanded((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })
          }
        />
      )}
    </div>
  );
}
