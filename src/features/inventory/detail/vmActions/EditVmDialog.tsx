import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import {
  Button,
  Dialog,
  Dropdown,
  GroupBox,
  Icon,
  Tabs,
  TextField,
  cn,
} from "~/components/win95";
import type { TabItem } from "~/components/win95";
import { hostQuery, vlansQuery, vmQuery } from "~/api/queries";
import type { VmDisk, VmNic } from "~/api/types";
import { useVmManagementAction } from "../../actions/useVmManagementAction";
import { bytes } from "../../format";
import { confirm } from "../../confirm";
import { diskSizeGb, isBootDisk, newDiskPath } from "./diskPath";
import { vmActionDialog } from "./dialogStore";

const START_OPTIONS = [
  { value: "Nothing", label: "Nothing" },
  { value: "StartIfRunning", label: "Start if it was running (recommended)" },
  { value: "Start", label: "Always start" },
];
const STOP_OPTIONS = [
  { value: "TurnOff", label: "Turn off" },
  { value: "ShutDown", label: "Shut down (recommended)" },
  { value: "Save", label: "Save state" },
];
const SECURE_BOOT_TEMPLATES = [
  { value: "Windows", label: "Windows" },
  { value: "Linux", label: "Linux" },
  { value: "Others", label: "Others (UEFI CA)" },
];
const DISK_TYPE_OPTIONS = [
  { value: "Fixed", label: "Fixed (recommended)" },
  { value: "Dynamic", label: "Dynamic (thin)" },
];

const TABS: TabItem[] = [
  { id: "general", label: "General" },
  { id: "network", label: "Network" },
  { id: "disks", label: "Disks" },
];

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const bytesToGb = (b: number | null | undefined) =>
  b ? String(Math.round(b / GIB)) : "";
const gbToMb = (gb: string) => Math.round((Number(gb) || 0) * 1024);
const NIC_NAME_RE = /[^A-Za-z0-9\-_ ]/g;
const DISK_NAME_RE = /^[a-zA-Z0-9]{1,6}$/;

type NicAction = "none" | "edit" | "remove";
interface ExistingNic {
  nic: VmNic;
  action: NicAction;
  name: string;
  vlan: string; // '' = untagged
  switch: string;
}
interface NewNic {
  name: string;
  vlan: string;
  switch: string;
}

type DiskAction = "none" | "expand" | "remove";
interface ExistingDisk {
  disk: VmDisk;
  action: DiskAction;
  newSizeGb: number;
  deleteFile: boolean;
}
interface NewDisk {
  name: string;
  type: "Fixed" | "Dynamic";
  sizeGb: number;
}

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 text-base",
        disabled && "text-disabled-text",
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Radio({
  label,
  name,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 text-base",
        disabled && "text-disabled-text",
      )}
    >
      <input
        type="radio"
        name={name}
        className="h-3.5 w-3.5"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {label}
    </label>
  );
}

export function EditVmDialog({
  vmId,
  initialTab = "general",
}: {
  vmId: string;
  initialTab?: string;
}) {
  const vmQ = useQuery(vmQuery(vmId));
  const vm = vmQ.data;
  const m = useVmManagementAction({ id: vmId, name: vm?.name ?? "" });
  const vlans = useQuery({
    ...vlansQuery({ hostId: vm?.hostId ?? "" }),
    enabled: !!vm?.hostId,
  });
  const host = useQuery({
    ...hostQuery(vm?.hostId ?? ""),
    enabled: !!vm?.hostId,
  });
  const hostSwitches = host.data?.hardware?.vSwitches ?? [];

  const off = vm?.state === "Off";
  const isBios = vm?.firmware === "BIOS";
  const hasSnapshots = (vm?.snapshots.length ?? 0) > 0;
  const locked = !!vm?.lock;
  // A Generation 1 (BIOS) VM keeps its disks on the IDE controller, which
  // cannot add/remove/resize while the VM runs - require it powered off.
  const disksNeedOff = isBios && !off;

  const [tab, setTab] = React.useState(initialTab);

  // ---- General ----------------------------------------------------------
  const [cpu, setCpu] = React.useState("");
  // memory sizes are edited in whole GB
  const [memGb, setMemGb] = React.useState("");
  const [memType, setMemType] = React.useState("static");
  const [memMinGb, setMemMinGb] = React.useState("");
  const [memMaxGb, setMemMaxGb] = React.useState("");
  const [nested, setNested] = React.useState(false);
  const [secureBoot, setSecureBoot] = React.useState(false);
  const [secureBootTpl, setSecureBootTpl] = React.useState("Windows");
  const [autoStart, setAutoStart] = React.useState("Nothing");
  const [autoStartDelay, setAutoStartDelay] = React.useState("0");
  const [autoStop, setAutoStop] = React.useState("TurnOff");
  const [notes, setNotes] = React.useState("");

  // ---- Network ---------------------------------------------------------
  const [existingNics, setExistingNics] = React.useState<ExistingNic[]>([]);
  const [newNics, setNewNics] = React.useState<NewNic[]>([]);

  // ---- Disks ---------------------------------------------------------
  const [existingDisks, setExistingDisks] = React.useState<ExistingDisk[]>([]);
  const [newDisks, setNewDisks] = React.useState<NewDisk[]>([]);

  React.useEffect(() => {
    if (!vm) return;
    setCpu(String(vm.vcpu));
    setMemGb(bytesToGb(vm.memory.assignedBytes));
    setMemType(vm.memory.dynamic ? "dynamic" : "static");
    setMemMinGb(bytesToGb(vm.memory.minBytes));
    setMemMaxGb(bytesToGb(vm.memory.maxBytes));
    setNested(vm.nestedVirtualization);
    setSecureBoot(!!vm.secureBoot);
    setSecureBootTpl(vm.secureBootTemplate || "Windows");
    setAutoStart(vm.autoStartAction || "Nothing");
    setAutoStartDelay(String(vm.autoStartDelaySec ?? 0));
    setAutoStop(vm.autoStopAction || "TurnOff");
    setNotes(vm.notes ?? "");
    setExistingNics(
      vm.nics.map((nic) => ({
        nic,
        action: "none" as NicAction,
        name: nic.name || "",
        vlan: nic.vlanId != null ? String(nic.vlanId) : "",
        switch: nic.switchName || "",
      })),
    );
    setNewNics([]);
    setExistingDisks(
      vm.disks.map((disk) => ({
        disk,
        action: "none" as DiskAction,
        newSizeGb: diskSizeGb(disk.sizeBytes) + 10,
        deleteFile: false,
      })),
    );
    setNewDisks([]);
  }, [vm]);

  const vlanOptions = [
    { value: "", label: "Untagged" },
    ...(vlans.data ?? []).map((v) => ({
      value: String(v.vlanId),
      label: `${v.name} (VLAN ${v.vlanId})`,
    })),
  ];

  // switches reported for the VM's host, plus any switch a NIC already references
  // that the host inventory didn't list (so the current value stays selectable).
  const switchOptions = React.useMemo(() => {
    const names = new Set(hostSwitches.map((s) => s.name));
    for (const n of vm?.nics ?? []) if (n.switchName) names.add(n.switchName);
    return [...names].sort().map((name) => ({ value: name, label: name }));
  }, [hostSwitches, vm?.nics]);

  const defaultSwitch = hostSwitches[0]?.name ?? switchOptions[0]?.value ?? "";

  // ---- change diff ----------------------------------------------------
  const { params, diskRemovals, diskErrors, memErrors } = React.useMemo(() => {
    const empty = {
      params: {} as Record<string, unknown>,
      diskRemovals: [] as ExistingDisk[],
      diskErrors: [] as string[],
      memErrors: [] as string[],
    };
    if (!vm) return empty;
    const p: Record<string, unknown> = {};

    const cpuN = Number(cpu);
    if (off && cpuN >= 1 && cpuN !== vm.vcpu) p.cpu_count = cpuN;

    // ---- memory: startup size, static/dynamic mode, dynamic min/max --------
    const mErrs: string[] = [];
    if (off) {
      const startupMb = gbToMb(memGb);
      const curStartupMb = Math.round(vm.memory.assignedBytes / MIB);
      const wantDynamic = memType === "dynamic";
      const minMb = gbToMb(memMinGb);
      const maxMb = gbToMb(memMaxGb);
      const curMinMb = vm.memory.minBytes
        ? Math.round(vm.memory.minBytes / MIB)
        : null;
      const curMaxMb = vm.memory.maxBytes
        ? Math.round(vm.memory.maxBytes / MIB)
        : null;

      if (startupMb < 256) mErrs.push("Memory must be at least 1 GB.");
      if (startupMb >= 256 && startupMb !== curStartupMb) p.memory_mb = startupMb;
      if (wantDynamic !== vm.memory.dynamic) p.memory_dynamic = wantDynamic;

      if (wantDynamic) {
        if (memMinGb && minMb !== curMinMb) p.memory_min_mb = minMb;
        if (memMaxGb && maxMb !== curMaxMb) p.memory_max_mb = maxMb;
        const effMin = memMinGb ? minMb : (curMinMb ?? 0);
        const effMax = memMaxGb ? maxMb : (curMaxMb ?? Infinity);
        if (memMinGb && effMin > startupMb)
          mErrs.push("Minimum memory cannot exceed the startup memory.");
        if (memMaxGb && effMax < startupMb)
          mErrs.push("Maximum memory cannot be below the startup memory.");
        if (memMinGb && memMaxGb && effMin > effMax)
          mErrs.push("Minimum memory cannot exceed maximum memory.");
      }
    }
    if (off && nested !== vm.nestedVirtualization)
      p.nested_virtualization = nested;
    // Secure Boot is a UEFI-only feature - a BIOS (gen 1) VM cannot enable it.
    if (off && !isBios && secureBoot !== !!vm.secureBoot)
      p.secure_boot = secureBoot;
    if (
      off &&
      !isBios &&
      secureBoot &&
      secureBootTpl !== (vm.secureBootTemplate || "Windows")
    )
      p.secure_boot_template = secureBootTpl;

    if (autoStart !== (vm.autoStartAction || "Nothing"))
      p.automatic_start = autoStart;
    const delayN = Number(autoStartDelay) || 0;
    if (autoStart !== "Nothing" && delayN !== (vm.autoStartDelaySec ?? 0))
      p.automatic_start_delay = delayN;
    if (off && autoStop !== (vm.autoStopAction || "TurnOff"))
      p.automatic_stop = autoStop;
    if (notes !== (vm.notes ?? "")) p.notes = notes;

    const addNic = newNics
      .filter((n) => n.name.trim())
      .map((n) => ({
        name: n.name.trim(),
        vlan_id: n.vlan ? Number(n.vlan) : 0,
        ...(n.switch ? { switch_name: n.switch } : {}),
      }));
    if (addNic.length) p.add_nic = addNic;

    const removeNic = existingNics
      .filter((n) => n.action === "remove")
      .map((n) => ({ nic_id: n.nic.id }));
    if (removeNic.length) p.remove_nic = removeNic;

    const editNic = existingNics
      .filter((n) => {
        if (n.action !== "edit") return false;
        const curVlan = n.nic.vlanId != null ? String(n.nic.vlanId) : "";
        return (
          n.name !== (n.nic.name || "") ||
          n.vlan !== curVlan ||
          (n.switch && n.switch !== (n.nic.switchName || ""))
        );
      })
      .map((n) => {
        const e: {
          nic_id: string;
          name?: string;
          vlan_id?: number;
          switch_name?: string;
        } = { nic_id: n.nic.id };
        if (n.name !== (n.nic.name || "")) e.name = n.name.trim();
        const curVlan = n.nic.vlanId != null ? String(n.nic.vlanId) : "";
        if (n.vlan !== curVlan) e.vlan_id = n.vlan ? Number(n.vlan) : 0;
        if (n.switch && n.switch !== (n.nic.switchName || ""))
          e.switch_name = n.switch;
        return e;
      });
    if (editNic.length) p.edit_nic = editNic;

    // ---- disks - blocked while the VM has snapshots, or while a BIOS
    // (gen 1) VM is running ------------------------------------------------
    const dErrs: string[] = [];
    let dRemovals: ExistingDisk[] = [];
    if (!hasSnapshots && !disksNeedOff) {
      const addDisk = newDisks.map((d) => {
        if (!DISK_NAME_RE.test(d.name))
          dErrs.push(
            `Disk "${d.name || "(unnamed)"}": name must be 1–6 alphanumeric characters.`,
          );
        const path = newDiskPath(vm, d.name);
        if (!path)
          dErrs.push("Cannot determine a path for new disks on this VM.");
        return { path: path ?? "", type: d.type, size_gb: d.sizeGb };
      });
      if (addDisk.length) p.add_disk = addDisk;

      const editDisk = existingDisks
        .filter((d) => d.action === "expand")
        .map((d) => {
          if (d.newSizeGb * GIB <= d.disk.sizeBytes)
            dErrs.push(
              `${d.disk.path}: new size must be larger than ${diskSizeGb(d.disk.sizeBytes)} GB.`,
            );
          return { path: d.disk.path, size_gb: d.newSizeGb };
        });
      if (editDisk.length) p.edit_disk = editDisk;

      dRemovals = existingDisks.filter((d) => d.action === "remove");
      if (dRemovals.length)
        p.remove_disk = dRemovals.map((d) => ({
          path: d.disk.path,
          delete_from_disk: d.deleteFile,
        }));
    }

    return {
      params: p,
      diskRemovals: dRemovals,
      diskErrors: dErrs,
      memErrors: mErrs,
    };
  }, [
    vm,
    off,
    isBios,
    disksNeedOff,
    cpu,
    memGb,
    memType,
    memMinGb,
    memMaxGb,
    nested,
    secureBoot,
    secureBootTpl,
    autoStart,
    autoStartDelay,
    autoStop,
    notes,
    existingNics,
    newNics,
    existingDisks,
    newDisks,
    hasSnapshots,
  ]);

  const dirty = Object.keys(params).length > 0;
  const newNicsValid = newNics.every(
    (n) => !n.name || !NIC_NAME_RE.test(n.name),
  );
  const canSave =
    dirty &&
    newNicsValid &&
    diskErrors.length === 0 &&
    memErrors.length === 0 &&
    !locked &&
    !m.isPending;

  const submit = async () => {
    if (!canSave) return;
    if (diskRemovals.length > 0) {
      const ok = await confirm({
        title: `Remove ${diskRemovals.length} disk${diskRemovals.length > 1 ? "s" : ""} from "${vm?.name}"`,
        danger: true,
        confirmLabel: "Remove disks",
        message: (
          <div className="space-y-2">
            <p className="font-bold text-danger">
              This is a destructive action and can damage the VM.
            </p>
            <p>
              Detaching a disk can render the guest unbootable and cause data
              loss, particularly if the VM is running.
              {diskRemovals.some((d) => d.deleteFile)
                ? ' Disks marked "delete file" are erased permanently.'
                : ""}{" "}
              This cannot be undone.
            </p>
            <ul className="list-disc pl-5">
              {diskRemovals.map((d) => (
                <li key={d.disk.id} className="font-mono break-all">
                  {d.disk.path}
                  {d.deleteFile ? " - delete file" : ""}
                </li>
              ))}
            </ul>
          </div>
        ),
      });
      if (!ok) return;
    }
    m.mutate(
      { kind: "action", action: "edit", params },
      { onSuccess: vmActionDialog.close },
    );
  };

  const patchNic = (i: number, patch: Partial<ExistingNic>) =>
    setExistingNics((ns) =>
      ns.map((n, j) => (j === i ? { ...n, ...patch } : n)),
    );
  const patchDisk = (i: number, patch: Partial<ExistingDisk>) =>
    setExistingDisks((ds) =>
      ds.map((d, j) => (j === i ? { ...d, ...patch } : d)),
    );

  const disksBlocked = hasSnapshots || locked || disksNeedOff;

  return (
    <Dialog
      title={`Edit "${vm?.name ?? "…"}"`}
      onClose={vmActionDialog.close}
      width={600}
      footer={
        <>
          <Button className="font-bold" disabled={!canSave} onClick={submit}>
            Save Changes
          </Button>
          <Button onClick={() => vmActionDialog.close()}>Cancel</Button>
        </>
      }
    >
      <div className="flex h-[440px] flex-col">
        {locked ? (
          <p className="bevel-thin-sunken mb-2 shrink-0 bg-notice-bg p-2 text-notice-text">
            Another operation is running on this VM - wait for it to finish
            before editing.
          </p>
        ) : null}

        <Tabs tabs={TABS} value={tab} onChange={setTab} className="flex-1">
          {tab === "general" && (
            <div className="flex flex-col gap-4">
              <div className="mx-auto flex w-[99%] flex-col gap-4">
                {/* `fr`, not `%` - percentage columns don't get the `gap`
                    subtracted from them, so the row quietly overflows its
                    container by one gap width and eats the right margin. */}
                <div className="grid grid-cols-[30fr_70fr] gap-3">
                  <GroupBox label="CPU" className="space-y-3">
                    <label className="flex flex-col gap-1 text-base">
                      Virtual CPUs
                      <TextField
                        type="number"
                        min={1}
                        max={256}
                        disabled={!off}
                        value={cpu}
                        onChange={(e) => setCpu(e.target.value)}
                      />
                    </label>
                    <Check
                      label="Nested virtualization"
                      checked={nested}
                      onChange={setNested}
                      disabled={!off}
                    />
                  </GroupBox>

                  <GroupBox label="Memory" className="space-y-3">
                    <div className="flex gap-4">
                      <Radio
                        label="Dynamic"
                        name="mem-type"
                        checked={memType === "dynamic"}
                        onChange={() => setMemType("dynamic")}
                        disabled={!off}
                      />
                      <Radio
                        label="Fixed"
                        name="mem-type"
                        checked={memType === "static"}
                        onChange={() => setMemType("static")}
                        disabled={!off}
                      />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label
                        className={cn(
                          "flex flex-col gap-1 text-base",
                          memType === "dynamic" ? "w-24" : "w-[106px]",
                        )}
                      >
                        {memType === "dynamic" ? "Startup (GB)" : "Memory (GB)"}
                        <TextField
                          type="number"
                          min={1}
                          step={1}
                          disabled={!off}
                          value={memGb}
                          onChange={(e) =>
                            setMemGb(e.target.value.replace(/[^0-9]/g, ""))
                          }
                        />
                      </label>
                      {memType === "dynamic" && (
                        <>
                          <label className="flex w-24 flex-col gap-1 text-base">
                            Min (GB)
                            <TextField
                              type="number"
                              min={1}
                              step={1}
                              disabled={!off}
                              value={memMinGb}
                              onChange={(e) =>
                                setMemMinGb(e.target.value.replace(/[^0-9]/g, ""))
                              }
                            />
                          </label>
                          <label className="flex w-24 flex-col gap-1 text-base">
                            Max (GB)
                            <TextField
                              type="number"
                              min={1}
                              step={1}
                              disabled={!off}
                              value={memMaxGb}
                              onChange={(e) =>
                                setMemMaxGb(e.target.value.replace(/[^0-9]/g, ""))
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                    {memErrors.length > 0 ? (
                      <div className="text-danger">
                        {memErrors.map((e, i) => (
                          <p key={i}>{e}</p>
                        ))}
                      </div>
                    ) : null}
                  </GroupBox>
                </div>

                <div
                  className={cn(
                    "grid gap-3",
                    isBios ? "grid-cols-1" : "grid-cols-[30fr_70fr]",
                  )}
                >
                  {/* Secure Boot is a UEFI-only (generation 2) feature - the
                      groupbox is removed entirely for a BIOS (gen 1) VM, and
                      Start/stop policy expands to fill the row. */}
                  {!isBios && (
                    <GroupBox label="Secure Boot" className="space-y-3">
                      <Check
                        label="Enable Secure Boot"
                        checked={secureBoot}
                        onChange={setSecureBoot}
                        disabled={!off}
                      />
                      <label className="flex flex-col gap-1 text-base">
                        Template
                        <Dropdown
                          value={secureBootTpl}
                          onChange={setSecureBootTpl}
                          disabled={!off || !secureBoot}
                          options={SECURE_BOOT_TEMPLATES}
                        />
                      </label>
                    </GroupBox>
                  )}

                  <GroupBox label="Start / stop policy" className="space-y-3">
                    <div className="flex gap-3">
                      <label className="flex flex-1 flex-col gap-1 text-base">
                        Automatic start
                        <Dropdown
                          value={autoStart}
                          onChange={setAutoStart}
                          options={START_OPTIONS}
                        />
                      </label>
                      <label className="flex w-24 flex-col gap-1 text-base">
                        Delay (s)
                        <TextField
                          type="number"
                          min={0}
                          value={autoStartDelay}
                          onChange={(e) =>
                            setAutoStartDelay(e.target.value.replace(/[^0-9]/g, ""))
                          }
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-base">
                      Automatic stop
                      <Dropdown
                        value={autoStop}
                        onChange={setAutoStop}
                        disabled={!off}
                        options={STOP_OPTIONS}
                      />
                    </label>
                  </GroupBox>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-base">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="ui-field w-full resize-none px-1.5 py-[3px] text-base outline-none"
                />
              </label>
            </div>
          )}

          {tab === "network" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold">Network adapters</span>
                <Button
                  className="min-w-0 px-2"
                  onClick={() =>
                    setNewNics((ns) => [
                      ...ns,
                      {
                        name: `Network Adapter ${vm ? vm.nics.length + ns.length + 1 : ns.length + 1}`,
                        vlan: "",
                        switch: defaultSwitch,
                      },
                    ])
                  }
                >
                  <Icon icon={Plus} size={14} />
                  Add adapter
                </Button>
              </div>

              {existingNics.map((en, i) => (
                <div
                  key={en.nic.id || i}
                  className={cn(
                    "bevel-thin-sunken space-y-2 p-2",
                    en.action === "remove" && "bg-danger-bg",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-base">
                      <div className="font-bold">
                        {en.nic.name || "Network Adapter"}
                      </div>
                      <div className="text-disabled-text">
                        {en.nic.switchName || "no switch"} ·{" "}
                        {en.nic.vlanId != null
                          ? `VLAN ${en.nic.vlanId}`
                          : "Untagged"}{" "}
                        · {en.nic.macAddress || "no MAC"}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {en.action === "none" ? (
                        <>
                          <Button
                            className="min-w-0 px-2"
                            onClick={() => patchNic(i, { action: "edit" })}
                          >
                            Edit
                          </Button>
                          <Button
                            className="min-w-0 px-2"
                            onClick={() => patchNic(i, { action: "remove" })}
                          >
                            <Icon icon={Trash2} size={14} />
                          </Button>
                        </>
                      ) : (
                        <Button
                          className="min-w-0 px-2"
                          onClick={() =>
                            patchNic(i, {
                              action: "none",
                              name: en.nic.name || "",
                              vlan:
                                en.nic.vlanId != null
                                  ? String(en.nic.vlanId)
                                  : "",
                              switch: en.nic.switchName || "",
                            })
                          }
                        >
                          <Icon icon={RotateCcw} size={14} />
                          Undo
                        </Button>
                      )}
                    </div>
                  </div>

                  {en.action === "edit" && (
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <label className="flex flex-1 flex-col gap-1 text-base">
                          Name
                          <TextField
                            value={en.name}
                            onChange={(e) =>
                              patchNic(i, {
                                name: e.target.value.replace(NIC_NAME_RE, ""),
                              })
                            }
                          />
                        </label>
                        <label className="flex flex-1 flex-col gap-1 text-base">
                          VLAN
                          <Dropdown
                            value={en.vlan}
                            onChange={(v) => patchNic(i, { vlan: v })}
                            options={vlanOptions}
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1 text-base">
                        Virtual switch
                        <Dropdown
                          value={en.switch}
                          onChange={(v) => patchNic(i, { switch: v })}
                          placeholder={
                            switchOptions.length
                              ? "Select a switch…"
                              : "No switches reported"
                          }
                          options={switchOptions}
                        />
                      </label>
                    </div>
                  )}
                  {en.action === "remove" && (
                    <p className="text-danger">
                      This adapter will be removed when you save.
                    </p>
                  )}
                </div>
              ))}

              {newNics.map((nic, i) => (
                <div
                  key={`new-${i}`}
                  className="bevel-thin-sunken space-y-2 border border-dashed border-bevel-dark p-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold">
                      New adapter {i + 1}
                    </span>
                    <Button
                      className="min-w-0 px-2"
                      onClick={() =>
                        setNewNics((ns) => ns.filter((_, j) => j !== i))
                      }
                    >
                      <Icon icon={Trash2} size={14} />
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <label className="flex flex-1 flex-col gap-1 text-base">
                        Name
                        <TextField
                          value={nic.name}
                          onChange={(e) =>
                            setNewNics((ns) =>
                              ns.map((n, j) =>
                                j === i
                                  ? {
                                      ...n,
                                      name: e.target.value.replace(
                                        NIC_NAME_RE,
                                        "",
                                      ),
                                    }
                                  : n,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="flex flex-1 flex-col gap-1 text-base">
                        VLAN
                        <Dropdown
                          value={nic.vlan}
                          onChange={(v) =>
                            setNewNics((ns) =>
                              ns.map((n, j) =>
                                j === i ? { ...n, vlan: v } : n,
                              ),
                            )
                          }
                          options={vlanOptions}
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-base">
                      Virtual switch
                      <Dropdown
                        value={nic.switch}
                        onChange={(v) =>
                          setNewNics((ns) =>
                            ns.map((n, j) =>
                              j === i ? { ...n, switch: v } : n,
                            ),
                          )
                        }
                        placeholder={
                          switchOptions.length
                            ? "Select a switch…"
                            : "No switches reported"
                        }
                        options={switchOptions}
                      />
                    </label>
                  </div>
                </div>
              ))}

              {existingNics.length === 0 && newNics.length === 0 ? (
                <p className="text-disabled-text">No network adapters.</p>
              ) : null}
              {switchOptions.length === 0 ? (
                <p className="text-disabled-text">
                  No virtual switches reported for this host - the agent will
                  fall back to the first switch it finds.
                </p>
              ) : null}
            </div>
          )}

          {tab === "disks" && (
            <div className="flex flex-col gap-2">
              {hasSnapshots ? (
                <p className="bevel-thin-sunken bg-notice-bg p-2 text-notice-text">
                  <Icon icon={TriangleAlert} size={13} /> Disk changes are
                  blocked while the VM has snapshots. Delete every snapshot
                  first.
                </p>
              ) : disksNeedOff ? (
                <p className="bevel-thin-sunken bg-notice-bg p-2 text-notice-text">
                  <Icon icon={TriangleAlert} size={13} /> This is a BIOS
                  (generation 1) VM. Its disks are on the IDE controller, which
                  cannot change while the VM is running - power off the VM to
                  add, expand or remove disks.
                </p>
              ) : !off ? (
                <p className="text-disabled-text">
                  The VM is {vm?.state}. Disks can be added and expanded live;
                  removing a disk while running is dangerous.
                </p>
              ) : null}

              <div className="flex items-center justify-between">
                <span className="text-base font-bold">Virtual disks</span>
                <Button
                  className="min-w-0 px-2"
                  disabled={disksBlocked}
                  onClick={() =>
                    setNewDisks((ds) => [
                      ...ds,
                      { name: "", type: "Fixed", sizeGb: 60 },
                    ])
                  }
                >
                  <Icon icon={Plus} size={14} />
                  Add disk
                </Button>
              </div>

              {existingDisks.map((ed, i) => {
                // 0:0 is the boot disk and is never removable; if the agent
                // didn't report a controller, protect the first disk.
                const boot =
                  isBootDisk(ed.disk.controller) ||
                  (i === 0 && !ed.disk.controller);
                const curGb = diskSizeGb(ed.disk.sizeBytes);
                return (
                  <div
                    key={ed.disk.id || i}
                    className={cn(
                      "bevel-thin-sunken space-y-2 p-2",
                      ed.action === "remove" && "bg-danger-bg",
                      ed.action === "expand" && "bg-info-bg",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-base">
                        <div className="font-mono break-all">
                          {ed.disk.path}
                        </div>
                        <div className="text-disabled-text">
                          {ed.disk.controller || "-"} · {ed.disk.type || "-"} ·{" "}
                          {ed.disk.format || "-"} · {bytes(ed.disk.sizeBytes)}
                          {boot ? " · boot disk" : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {ed.action === "none" ? (
                          <>
                            <Button
                              className="min-w-0 px-2"
                              disabled={disksBlocked}
                              onClick={() => patchDisk(i, { action: "expand" })}
                            >
                              Expand
                            </Button>
                            <Button
                              className="min-w-0 px-2"
                              disabled={boot || disksBlocked}
                              title={
                                boot
                                  ? "The boot disk (0:0) cannot be removed"
                                  : "Remove disk"
                              }
                              onClick={() => patchDisk(i, { action: "remove" })}
                            >
                              <Icon icon={Trash2} size={14} />
                            </Button>
                          </>
                        ) : (
                          <Button
                            className="min-w-0 px-2"
                            onClick={() => patchDisk(i, { action: "none" })}
                          >
                            <Icon icon={RotateCcw} size={14} />
                            Undo
                          </Button>
                        )}
                      </div>
                    </div>

                    {ed.action === "expand" && (
                      <label className="flex flex-col gap-1 text-base">
                        New size (GB) - must be greater than {curGb}
                        <TextField
                          type="number"
                          min={curGb + 1}
                          className="w-32"
                          value={ed.newSizeGb}
                          onChange={(e) =>
                            patchDisk(i, {
                              newSizeGb: Number(e.target.value) || 0,
                            })
                          }
                        />
                        {ed.newSizeGb * GIB <= ed.disk.sizeBytes ? (
                          <span className="text-danger">
                            Must be larger than {curGb} GB.
                          </span>
                        ) : null}
                      </label>
                    )}

                    {ed.action === "remove" && (
                      <div className="space-y-1">
                        <p className="text-danger">
                          <Icon icon={TriangleAlert} size={13} /> Destructive -
                          this disk will be detached from the VM on save.
                        </p>
                        <label className="flex items-center gap-2 text-base">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={ed.deleteFile}
                            onChange={(e) =>
                              patchDisk(i, { deleteFile: e.target.checked })
                            }
                          />
                          Also delete the VHDX file from disk (permanent)
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}

              {newDisks.map((nd, i) => (
                <div
                  key={`new-${i}`}
                  className="bevel-thin-sunken space-y-2 border border-dashed border-bevel-dark p-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold">
                      New disk {i + 1}
                    </span>
                    <Button
                      className="min-w-0 px-2"
                      onClick={() =>
                        setNewDisks((ds) => ds.filter((_, j) => j !== i))
                      }
                    >
                      <Icon icon={Trash2} size={14} />
                    </Button>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex w-24 flex-col gap-1 text-base">
                      Name
                      <TextField
                        maxLength={6}
                        value={nd.name}
                        onChange={(e) =>
                          setNewDisks((ds) =>
                            ds.map((d, j) =>
                              j === i ? { ...d, name: e.target.value } : d,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-base">
                      Type
                      <Dropdown
                        value={nd.type}
                        onChange={(v) =>
                          setNewDisks((ds) =>
                            ds.map((d, j) =>
                              j === i
                                ? { ...d, type: v as NewDisk["type"] }
                                : d,
                            ),
                          )
                        }
                        options={DISK_TYPE_OPTIONS}
                      />
                    </label>
                    <label className="flex w-24 flex-col gap-1 text-base">
                      Size (GB)
                      <TextField
                        type="number"
                        min={1}
                        value={nd.sizeGb}
                        onChange={(e) =>
                          setNewDisks((ds) =>
                            ds.map((d, j) =>
                              j === i
                                ? { ...d, sizeGb: Number(e.target.value) || 1 }
                                : d,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  {vm && newDiskPath(vm, nd.name) ? (
                    <p className="text-disabled-text">
                      Path:{" "}
                      <span className="font-mono break-all">
                        {newDiskPath(vm, nd.name)}
                      </span>
                    </p>
                  ) : null}
                </div>
              ))}

              {existingDisks.length === 0 && newDisks.length === 0 ? (
                <p className="text-disabled-text">No virtual disks.</p>
              ) : null}

              {diskErrors.length > 0 ? (
                <div className="text-danger">
                  {diskErrors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Tabs>
      </div>
    </Dialog>
  );
}
