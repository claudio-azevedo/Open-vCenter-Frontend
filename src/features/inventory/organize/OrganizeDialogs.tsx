import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, Dropdown, TextField } from "~/components/win95";
import { clustersQuery, foldersQuery, hostQuery } from "~/api/queries";
import { useInventorySelection } from "../selection";
import { useVmFolderTargets } from "./scope";
import { organizeDialog, useOrganizeDialog } from "./dialogStore";
import {
  ClusterManagementDialog,
  HostManagementDialog,
} from "./ManagementDialogs";
import { AgentManagementDialog } from "./AgentManagementDialog";
import { CreateVmDialog } from "../create/CreateVmDialog";
import {
  useCreateFolder,
  useDeleteFolder,
  useMoveVm,
  useUpdateHost,
} from "./mutations";

const STANDALONE = "__standalone__";

export function OrganizeDialogs() {
  const dialog = useOrganizeDialog();
  if (!dialog) return null;
  switch (dialog.kind) {
    case "cluster-management":
      return <ClusterManagementDialog />;
    case "host-management":
      return <HostManagementDialog />;
    case "agent-management":
      return <AgentManagementDialog />;
    case "new-folder":
      return (
        <NewFolderDialog clusterId={dialog.clusterId} hostId={dialog.hostId} />
      );
    case "new-vm":
      return (
        <CreateVmDialog
          clusterId={dialog.clusterId}
          hostId={dialog.hostId}
          mode={dialog.mode}
          sourceVmId={dialog.sourceVmId}
          templateId={dialog.templateId}
        />
      );
    case "move-vm":
      return <MoveVmDialog vmId={dialog.vmId} />;
    case "move-host":
      return <MoveHostDialog hostId={dialog.hostId} />;
    case "delete-folder":
      return <DeleteFolderDialog folderId={dialog.folderId} />;
  }
}

function Footer({
  onOk,
  okLabel = "OK",
  okDisabled,
  danger,
}: {
  onOk: () => void;
  okLabel?: string;
  okDisabled?: boolean;
  danger?: boolean;
}) {
  return (
    <>
      <Button
        onClick={onOk}
        disabled={okDisabled}
        className={danger ? "font-bold" : ""}
      >
        {okLabel}
      </Button>
      <Button onClick={() => organizeDialog.close()}>Cancel</Button>
    </>
  );
}

// ---- New folder --------------------------------------------------------

function NewFolderDialog({
  clusterId,
  hostId,
}: {
  clusterId?: string;
  hostId?: string;
}) {
  const clusters = useQuery(clustersQuery());
  const [name, setName] = React.useState("");
  const m = useCreateFolder();

  const scopeLabel = clusterId
    ? `Cluster: ${clusters.data?.find((c) => c.id === clusterId)?.name ?? clusterId}`
    : `Standalone host`;

  const submit = () =>
    name.trim() &&
    m.mutate(
      { name: name.trim(), clusterId, hostId },
      { onSuccess: organizeDialog.close },
    );

  return (
    <Dialog
      title="New Folder"
      onClose={organizeDialog.close}
      footer={
        <Footer onOk={submit} okLabel="Create" okDisabled={!name.trim()} />
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-disabled-text">{scopeLabel}</p>
        <TextField
          label="Folder name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
    </Dialog>
  );
}

// ---- Move VM to folder -----------------------------------------------

function MoveVmDialog({ vmId }: { vmId: string }) {
  const { vm, host, targets: reachable } = useVmFolderTargets(vmId);
  const m = useMoveVm();

  const [target, setTarget] = React.useState<string>("");
  React.useEffect(() => setTarget(vm?.folderId ?? ""), [vm?.folderId]);
  // nothing to do when there's no folder to pick or the VM is already there
  const unchanged = target === (vm?.folderId ?? "");

  const submit = () =>
    m.mutate(
      { id: vmId, folderId: target || null },
      { onSuccess: organizeDialog.close },
    );

  return (
    <Dialog
      title={`Move "${vm?.name ?? "…"}" to Folder`}
      onClose={organizeDialog.close}
      footer={
        <Footer
          onOk={submit}
          okLabel="Move"
          okDisabled={!vm || reachable.length === 0 || unchanged || m.isPending}
        />
      }
    >
      {reachable.length === 0 ? (
        <p className="text-disabled-text">
          No folders yet for this VM's{" "}
          {host?.clusterId ? "cluster" : "host"}. Select the host in the
          tree and use New Folder to create one first.
        </p>
      ) : (
        <Dropdown
          label="Folder"
          value={target}
          onChange={setTarget}
          options={[
            { value: "", label: "(no folder)" },
            ...reachable.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
      )}
    </Dialog>
  );
}

// ---- Move host to/from a cluster -----------------------------------

function MoveHostDialog({ hostId }: { hostId: string }) {
  const host = useQuery(hostQuery(hostId));
  const clusters = useQuery(clustersQuery());
  const m = useUpdateHost();
  const [cluster, setCluster] = React.useState(STANDALONE);
  React.useEffect(
    () => setCluster(host.data?.clusterId ?? STANDALONE),
    [host.data?.clusterId],
  );

  const submit = () =>
    m.mutate(
      { id: hostId, clusterId: cluster === STANDALONE ? null : cluster },
      { onSuccess: organizeDialog.close },
    );

  return (
    <Dialog
      title={`Move "${host.data?.name ?? "…"}"`}
      onClose={organizeDialog.close}
      footer={<Footer onOk={submit} okLabel="Move" />}
    >
      <div className="flex flex-col gap-2">
        <Dropdown
          label="Cluster"
          value={cluster}
          onChange={setCluster}
          options={[
            { value: STANDALONE, label: "(standalone)" },
            ...(clusters.data ?? []).map((c) => ({
              value: c.id,
              label: c.name,
            })),
          ]}
        />
        <p className="text-disabled-text">
          VMs on this host will be removed from their folders.
        </p>
      </div>
    </Dialog>
  );
}

// ---- Delete folder -------------------------------------------------

function DeleteFolderDialog({ folderId }: { folderId: string }) {
  const folders = useQuery(foldersQuery({}));
  const m = useDeleteFolder();
  const folder = folders.data?.find((f) => f.id === folderId);
  const { selection, select } = useInventorySelection();

  const submit = () =>
    m.mutate(folderId, {
      onSuccess: () => {
        if (selection?.kind === "folder" && selection.id === folderId)
          select(null);
        organizeDialog.close();
      },
    });

  return (
    <Dialog
      title="Delete Folder"
      onClose={organizeDialog.close}
      footer={<Footer onOk={submit} okLabel="Delete" danger />}
    >
      <p>
        Delete folder{" "}
        <span className="font-bold">{folder?.name ?? folderId}</span>? Its VMs
        stay where they are - they're just removed from the folder.
      </p>
    </Dialog>
  );
}
