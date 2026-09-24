import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, Dropdown, TextField } from "~/components/win95";
import { hostIsosQuery, hostQuery, vmQuery } from "~/api/queries";
import { useVmManagementAction } from "../../actions/useVmManagementAction";
import { bytes } from "../../format";
import { EditVmDialog } from "./EditVmDialog";
import { moveStorageTargets, storageKey } from "./storage";
import { vmActionDialog, useVmActionDialog } from "./dialogStore";

export function VmActionDialogs() {
  const dialog = useVmActionDialog();
  if (!dialog) return null;
  switch (dialog.kind) {
    case "rename":
      return <RenameDialog vmId={dialog.vmId} />;
    case "edit":
      return <EditVmDialog vmId={dialog.vmId} initialTab={dialog.tab} />;
    case "migrate":
      return <MigrateDialog vmId={dialog.vmId} />;
    case "move-storage":
      return <MoveStorageDialog vmId={dialog.vmId} />;
    case "autostart":
      return <AutoStartDialog vmId={dialog.vmId} />;
    case "mount-dvd":
      return <MountDvdDialog vmId={dialog.vmId} />;
    case "export-template":
      return <ExportTemplateDialog vmId={dialog.vmId} />;
    case "notes":
      return <NotesDialog vmId={dialog.vmId} />;
    case "snapshot-create":
      return <SnapshotCreateDialog vmId={dialog.vmId} />;
  }
}

// ---- shared bits ----------------------------------------------------------

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
      <Button onClick={() => vmActionDialog.close()}>Cancel</Button>
    </>
  );
}

/** Common wrapper: loads the VM, wires the mutation, renders the Dialog shell. */
function useVmDialog(vmId: string) {
  const vm = useQuery(vmQuery(vmId));
  const m = useVmManagementAction({ id: vmId, name: vm.data?.name ?? "" });
  return { vm: vm.data, m };
}

// ---- Rename -------------------------------------------------------------

function RenameDialog({ vmId }: { vmId: string }) {
  const { vm, m } = useVmDialog(vmId);
  const [name, setName] = React.useState("");
  React.useEffect(() => setName(vm?.name ?? ""), [vm?.name]);

  const submit = () =>
    name.trim() &&
    name.trim() !== vm?.name &&
    m.mutate(
      { kind: "action", action: "rename", params: { new_name: name.trim() } },
      { onSuccess: vmActionDialog.close },
    );

  return (
    <Dialog
      title={`Rename "${vm?.name ?? "…"}"`}
      onClose={vmActionDialog.close}
      footer={
        <Footer
          onOk={submit}
          okLabel="Rename"
          okDisabled={!name.trim() || name.trim() === vm?.name}
        />
      }
    >
      <TextField
        label="New name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
    </Dialog>
  );
}

// ---- Edit VM (General / Network / Disks tabs) lives in EditVmDialog.tsx ----

// ---- Migrate ---------------------------------------------------------

function MigrateDialog({ vmId }: { vmId: string }) {
  const { vm, m } = useVmDialog(vmId);
  const host = useQuery({
    ...hostQuery(vm?.hostId ?? ""),
    enabled: !!vm?.hostId,
  });
  const nodes = (host.data?.hardware?.cluster?.nodes ?? []).filter(
    (n) => n.toLowerCase() !== (host.data?.name ?? "").toLowerCase(),
  );
  const [target, setTarget] = React.useState("");

  const submit = () =>
    target &&
    m.mutate(
      { kind: "action", action: "migrate", params: { target_host: target } },
      { onSuccess: vmActionDialog.close },
    );

  return (
    <Dialog
      title={`Migrate "${vm?.name ?? "…"}"`}
      onClose={vmActionDialog.close}
      footer={<Footer onOk={submit} okLabel="Migrate" okDisabled={!target} />}
    >
      {nodes.length === 0 ? (
        <p className="text-disabled-text">
          No other cluster nodes available for this VM's host.
        </p>
      ) : (
        <Dropdown
          label="Target host"
          value={target}
          onChange={setTarget}
          placeholder="Select a node…"
          options={nodes.map((n) => ({ value: n, label: n }))}
        />
      )}
    </Dialog>
  );
}

// ---- Move storage --------------------------------------------------

function MoveStorageDialog({ vmId }: { vmId: string }) {
  const { vm, m } = useVmDialog(vmId);
  const host = useQuery({
    ...hostQuery(vm?.hostId ?? ""),
    enabled: !!vm?.hostId,
  });
  const targets = vm ? moveStorageTargets(host.data, vm) : [];
  const defaultKey = storageKey(host.data?.hardware?.hyperv?.defaultVmPath);
  const [dest, setDest] = React.useState("");

  const submit = () =>
    dest &&
    m.mutate(
      {
        kind: "action",
        action: "move_storage",
        params: { destination_storage: dest },
      },
      { onSuccess: vmActionDialog.close },
    );

  return (
    <Dialog
      title={`Move storage - "${vm?.name ?? "…"}"`}
      onClose={vmActionDialog.close}
      footer={<Footer onOk={submit} okLabel="Move" okDisabled={!dest} />}
      width={440}
    >
      {targets.length === 0 ? (
        <p className="text-disabled-text">
          Nowhere to move this VM - the host reports only the volume it already
          lives on.
        </p>
      ) : (
        <Dropdown
          label="Destination volume"
          value={dest}
          onChange={setDest}
          placeholder="Select a volume…"
          options={targets.map((s) => ({
            value: s.path,
            label: `${s.label ? `${s.label} - ` : ""}${s.path}${
              storageKey(s.path) === defaultKey ? " (default)" : ""
            } (${bytes(s.freeBytes)} free / ${bytes(s.totalBytes)})`,
          }))}
        />
      )}
    </Dialog>
  );
}

// ---- AutoStart config -------------------------------------------

function AutoStartDialog({ vmId }: { vmId: string }) {
  const { vm, m } = useVmDialog(vmId);
  const [mode, setMode] = React.useState("Nothing");
  const [delay, setDelay] = React.useState("0");

  // Seed both fields from the VM's current AutoStart configuration.
  React.useEffect(() => {
    if (!vm) return;
    setMode(vm.autoStartAction || "Nothing");
    setDelay(String(vm.autoStartDelaySec ?? 0));
  }, [vm]);

  const submit = () =>
    m.mutate(
      {
        kind: "action",
        action: "startup_change",
        params: {
          automatic_start: mode,
          automatic_start_delay: Number(delay) || 0,
        },
      },
      { onSuccess: vmActionDialog.close },
    );

  return (
    <Dialog
      title={`AutoStart - "${vm?.name ?? "…"}"`}
      onClose={vmActionDialog.close}
      footer={<Footer onOk={submit} okLabel="Save" />}
    >
      <div className="flex flex-col gap-3">
        <Dropdown
          label="Automatic start action"
          value={mode}
          onChange={setMode}
          options={[
            { value: "Nothing", label: "Nothing" },
            {
              value: "StartIfRunning",
              label: "Start if it was running (recommended)",
            },
            { value: "Start", label: "Always start" },
          ]}
        />
        <TextField
          label="Startup delay (seconds)"
          type="number"
          min={0}
          value={delay}
          onChange={(e) => setDelay(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-32"
        />
      </div>
    </Dialog>
  );
}

// ---- Mount DVD -------------------------------------------------

function MountDvdDialog({ vmId }: { vmId: string }) {
  const { vm, m } = useVmDialog(vmId);
  const isos = useQuery({
    ...hostIsosQuery(vm?.hostId ?? ""),
    enabled: !!vm?.hostId,
  });
  const [path, setPath] = React.useState("");

  const submit = () =>
    path &&
    m.mutate(
      { kind: "action", action: "mount_dvd", params: { path } },
      { onSuccess: vmActionDialog.close },
    );

  return (
    <Dialog
      title={`Mount DVD - "${vm?.name ?? "…"}"`}
      onClose={vmActionDialog.close}
      footer={<Footer onOk={submit} okLabel="Mount" okDisabled={!path} />}
      width={420}
    >
      {(isos.data ?? []).length === 0 ? (
        <p className="text-disabled-text">
          No ISO images reported for this host.
        </p>
      ) : (
        <Dropdown
          label="ISO image"
          value={path}
          onChange={setPath}
          placeholder="Select an ISO…"
          options={(isos.data ?? []).map((iso) => ({
            value: iso.path,
            label: iso.name,
          }))}
        />
      )}
    </Dialog>
  );
}

// ---- Export as template ---------------------------------------

function ExportTemplateDialog({ vmId }: { vmId: string }) {
  const { vm, m } = useVmDialog(vmId);
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const valid = /^[a-zA-Z0-9_-]+$/.test(name);

  const submit = () =>
    valid &&
    m.mutate(
      {
        kind: "action",
        action: "export_template",
        params: {
          template_name: name,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      },
      { onSuccess: vmActionDialog.close },
    );

  return (
    <Dialog
      title={`Export "${vm?.name ?? "…"}" as template`}
      onClose={vmActionDialog.close}
      footer={
        <Footer
          onOk={submit}
          okLabel="Export"
          okDisabled={!valid || vm?.state !== "Off"}
        />
      }
    >
      <div className="flex flex-col gap-2">
        {vm && vm.state !== "Off" ? (
          <p className="text-disabled-text">The VM must be off to export.</p>
        ) : null}
        <TextField
          label="Template name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="_TEMPLATE_WIN2022_BASE"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <p className="text-disabled-text">Letters, digits, - and _ only.</p>
        <label className="flex flex-col gap-1 text-base">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What this template is, how it was prepared…"
            className="ui-field w-full resize-none px-1.5 py-[3px] text-base outline-none"
          />
        </label>
      </div>
    </Dialog>
  );
}

// ---- Notes -------------------------------------------------

function NotesDialog({ vmId }: { vmId: string }) {
  const { vm, m } = useVmDialog(vmId);
  const [notes, setNotes] = React.useState("");
  React.useEffect(() => setNotes(vm?.notes ?? ""), [vm?.notes]);

  const submit = () =>
    m.mutate(
      { kind: "action", action: "notes_edit", params: { notes } },
      { onSuccess: vmActionDialog.close },
    );

  return (
    <Dialog
      title={`Notes - "${vm?.name ?? "…"}"`}
      onClose={vmActionDialog.close}
      footer={<Footer onOk={submit} okLabel="Save" />}
      width={420}
    >
      <textarea
        autoFocus
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={6}
        className="ui-field w-full resize-none px-1.5 py-[3px] text-base outline-none"
      />
    </Dialog>
  );
}

// ---- Snapshot create --------------------------------------

function SnapshotCreateDialog({ vmId }: { vmId: string }) {
  const { vm, m } = useVmDialog(vmId);
  const [name, setName] = React.useState("");

  const submit = () =>
    m.mutate(
      {
        kind: "action",
        action: "snapshot_create",
        params: name.trim() ? { name: name.trim() } : {},
      },
      { onSuccess: vmActionDialog.close },
    );

  return (
    <Dialog
      title={`New snapshot - "${vm?.name ?? "…"}"`}
      onClose={vmActionDialog.close}
      footer={<Footer onOk={submit} okLabel="Create" />}
    >
      <TextField
        label="Snapshot name (optional)"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
    </Dialog>
  );
}
