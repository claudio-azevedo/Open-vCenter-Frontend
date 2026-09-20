import { createElement } from "react";
import type { TreeNode } from "~/components/win95";
import type { Cluster, Folder, Host, Template, Vm } from "~/api/types";
import {
  ClusterIcon,
  FolderIcon,
  HostIcon,
  TemplateIcon,
  VmIcon,
} from "./nodeIcons";
import type { Selection, SelectionKind } from "../selection";

const SELECTABLE_KINDS: SelectionKind[] = [
  "cluster",
  "host",
  "folder",
  "vm",
  "templatefolder",
  "template",
];

export function selectionToNodeId(sel: Selection | null): string | undefined {
  return sel ? `${sel.kind}:${sel.id}` : undefined;
}

export function nodeIdToSelection(nodeId: string): Selection | null {
  const [kind, ...rest] = nodeId.split(":");
  const id = rest.join(":");
  if (id && SELECTABLE_KINDS.includes(kind as SelectionKind)) {
    return { kind: kind as SelectionKind, id };
  }
  return null;
}

/**
 * The "Templates" pseudo-folder shown right under a standalone host or a cluster
 * when it has inventoried templates. Its id carries the scope so the detail pane
 * knows what to list: `templatefolder:host:<id>` / `templatefolder:cluster:<id>`.
 */
function templatesFolderNode(
  scope: { kind: "host" | "cluster"; id: string },
  templates: Template[],
): TreeNode {
  return {
    id: `templatefolder:${scope.kind}:${scope.id}`,
    label: "Templates",
    icon: createElement(FolderIcon),
    children: [...templates]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({
        id: `template:${t.id}`,
        label: t.name,
        icon: createElement(TemplateIcon),
      })),
    hasChildren: true,
  };
}

function vmNode(vm: Vm): TreeNode {
  return {
    id: `vm:${vm.id}`,
    label: vm.name,
    icon: createElement(VmIcon, { state: vm.state }),
  };
}

function folderNode(folder: Folder, folderVms: Vm[]): TreeNode {
  return {
    id: `folder:${folder.id}`,
    label: folder.name,
    icon: createElement(FolderIcon),
    children: folderVms.map(vmNode),
    hasChildren: true, // always expandable so you can see it's empty / drop things in
  };
}

/**
 * Cluster children, in order: the "Templates" folder (only when the cluster has
 * templates) → hosts (leaf nodes) → folders (with their VMs) → loose VMs (in the
 * cluster, not assigned to a folder). Standalone hosts are not grouped under any
 * node - they sit at the tree root, after the clusters.
 */
function clusterNode(
  cluster: Cluster,
  hosts: Host[],
  folders: Folder[],
  vms: Vm[],
  templates: Template[],
): TreeNode {
  const hostIds = new Set(hosts.map((h) => h.id));
  const clusterVms = vms.filter((v) => hostIds.has(v.hostId));
  const clusterFolders = folders.filter((f) => f.clusterId === cluster.id);
  const folderIds = new Set(clusterFolders.map((f) => f.id));
  const clusterTemplates = templates.filter((t) => hostIds.has(t.hostId));

  return {
    id: `cluster:${cluster.id}`,
    label: cluster.name,
    icon: createElement(ClusterIcon),
    children: [
      ...(clusterTemplates.length
        ? [
            templatesFolderNode(
              { kind: "cluster", id: cluster.id },
              clusterTemplates,
            ),
          ]
        : []),
      ...hosts.map((h) => ({
        id: `host:${h.id}`,
        label: h.name,
        icon: createElement(HostIcon, { online: h.online }),
      })),
      ...clusterFolders.map((f) =>
        folderNode(
          f,
          clusterVms.filter((v) => v.folderId === f.id),
        ),
      ),
      ...clusterVms
        .filter((v) => !v.folderId || !folderIds.has(v.folderId))
        .map(vmNode),
    ],
  };
}

/** Standalone host owns its folders and its VMs directly. */
function standaloneHostNode(
  host: Host,
  folders: Folder[],
  vms: Vm[],
  templates: Template[],
): TreeNode {
  const hostVms = vms.filter((v) => v.hostId === host.id);
  const hostFolders = folders.filter((f) => f.hostId === host.id);
  const folderIds = new Set(hostFolders.map((f) => f.id));
  const hostTemplates = templates.filter((t) => t.hostId === host.id);

  return {
    id: `host:${host.id}`,
    label: host.name,
    icon: createElement(HostIcon, { online: host.online }),
    children: [
      ...(hostTemplates.length
        ? [templatesFolderNode({ kind: "host", id: host.id }, hostTemplates)]
        : []),
      ...hostFolders.map((f) =>
        folderNode(
          f,
          hostVms.filter((v) => v.folderId === f.id),
        ),
      ),
      ...hostVms
        .filter((v) => !v.folderId || !folderIds.has(v.folderId))
        .map(vmNode),
    ],
  };
}

export function buildInventoryTree(params: {
  clusters: Cluster[];
  hosts: Host[];
  folders: Folder[];
  vms: Vm[];
  templates: Template[];
}): TreeNode[] {
  const { clusters, hosts, folders, vms, templates } = params;

  const nodes: TreeNode[] = clusters.map((c) =>
    clusterNode(
      c,
      hosts.filter((h) => h.clusterId === c.id),
      folders,
      vms,
      templates,
    ),
  );

  // Standalone hosts sit at the root, right after the clusters - no wrapper node.
  for (const host of hosts.filter((h) => !h.clusterId)) {
    nodes.push(standaloneHostNode(host, folders, vms, templates));
  }

  return nodes;
}
