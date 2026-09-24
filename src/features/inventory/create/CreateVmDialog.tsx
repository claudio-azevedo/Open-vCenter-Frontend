import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  Dropdown,
  GroupBox,
  Icon,
  TextField,
  cn,
} from "~/components/win95";
import {
  clustersQuery,
  hostIsosQuery,
  hostQuery,
  hostsQuery,
  templatesQuery,
  vlansQuery,
  vmsQuery,
} from "~/api/queries";
import type { VmCreateBody, VmDiskSpec, VmFirmware, VmOs } from "~/api/types";
import { organizeDialog } from "../organize/dialogStore";
import { bytes } from "../format";
import {
  isClusteredHost,
  storageKey,
  vmStorageTargets,
} from "../detail/vmActions/storage";
import { useCloneVm, useCreateVlan, useCreateVm } from "../organize/mutations";

type Mode = "new" | "template" | "clone";

const STEPS = ["Identification", "Configuration", "Review"] as const;

const MODE_LABEL: Record<Mode, string> = {
  new: "New VM",
  template: "Deploy from template",
  clone: "Clone from VM",
};

const VOLUME_RE = /^[a-zA-Z]:/;
const CSV_RE = /^([a-zA-Z]:\\ClusterStorage\\[^\\]+)/i;

/**
 * Preview of the folder the host agent will place the VM in - a mirror of the
 * agent's `resolveVMFolder`. Display only; the agent has the final say.
 */
function previewVmFolder(
  defaultVmPath: string | null,
  destinationStorage: string,
  name: string,
): string {
  if (!name) return "";
  const def = (defaultVmPath ?? "").replace(/[\\/]+$/, "");
  const dest = destinationStorage.replace(/[\\/]+$/, "");
  if (!dest) return def ? `${def}\\${name}` : "";
  const csv = CSV_RE.exec(dest);
  if (csv) return `${csv[1]}\\VMS\\${name}`;
  const defVol = VOLUME_RE.exec(def)?.[0]?.toLowerCase();
  const destVol = VOLUME_RE.exec(dest)?.[0]?.toLowerCase();
  if (def && defVol && defVol === destVol) return `${def}\\${name}`;
  const vol = VOLUME_RE.exec(dest)?.[0];
  return vol ? `${vol}\\HyperV\\VMS\\${name}` : `${dest}\\VMS\\${name}`;
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/;
const DISK_NAME_RE = /^[a-zA-Z0-9]+$/;

const OS_OPTIONS: Array<{ value: VmOs; label: string }> = [
  { value: "windows", label: "Windows" },
  { value: "linux", label: "Linux" },
  { value: "other", label: "Other" },
];

const DISK_TYPE_OPTIONS = [
  { value: "Fixed", label: "Fixed (recommended)" },
  { value: "Dynamic", label: "Dynamic (thin)" },
];

interface DiskRow extends VmDiskSpec {}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-base">
      <input
        type="checkbox"
        className="h-3.5 w-3.5"
        checked={checked}
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
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-base">
      <input
        type="radio"
        name={name}
        className="h-3.5 w-3.5"
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}

export function CreateVmDialog({
  hostId: lockedHostId,
  clusterId,
  mode: initialMode,
  sourceVmId,
  templateId,
}: {
  hostId?: string;
  clusterId?: string;
  mode?: Mode;
  sourceVmId?: string;
  templateId?: string;
}) {
  const hosts = useQuery(hostsQuery());
  const clusters = useQuery(clustersQuery());
  const vms = useQuery(vmsQuery());
  const templates = useQuery(templatesQuery());
  const createVm = useCreateVm();
  const cloneVm = useCloneVm();
  const createVlan = useCreateVlan();

  // A source passed in by the caller pins the mode + source selection.
  const sourceLocked = !!(sourceVmId || templateId);
  const [mode, setMode] = React.useState<Mode>(
    initialMode ?? (sourceVmId ? "clone" : templateId ? "template" : "new"),
  );
  const isClone = mode !== "new";
  const [sourceId, setSourceId] = React.useState<string>(
    sourceVmId ?? templateId ?? "",
  );

  const [step, setStep] = React.useState(0);
  const [maxReached, setMaxReached] = React.useState(0);

  const [name, setName] = React.useState("");
  const [hostId, setHostId] = React.useState(lockedHostId ?? "");
  const [os, setOs] = React.useState<VmOs>("windows");
  const [firmware, setFirmware] = React.useState<VmFirmware>("UEFI");
  const [cpuCount, setCpuCount] = React.useState(2);
  const [memoryMb, setMemoryMb] = React.useState(4096);
  const [memoryDynamic, setMemoryDynamic] = React.useState(false);
  const [memoryMinMb, setMemoryMinMb] = React.useState(1024);
  const [memoryMaxMb, setMemoryMaxMb] = React.useState(8192);
  const [nested, setNested] = React.useState(false);
  const [haEnabled, setHaEnabled] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [vlanTag, setVlanTag] = React.useState<string>(""); // '' = untagged
  const [switchName, setSwitchName] = React.useState("");
  const [dvd, setDvd] = React.useState("");
  const [storageBase, setStorageBase] = React.useState("");
  const [startNow, setStartNow] = React.useState(false);
  const [expandDisks, setExpandDisks] = React.useState(true);
  const [disks, setDisks] = React.useState<DiskRow[]>([
    { name: "OS", type: "Fixed", sizeGb: 60 },
  ]);
  const [showAddVlan, setShowAddVlan] = React.useState(false);

  const hostName = (id: string) =>
    (hosts.data ?? []).find((h) => h.id === id)?.name ?? id;

  // ---- clone / template sources -------------------------------------------
  const offVms = React.useMemo(
    () => (vms.data ?? []).filter((v) => v.state === "Off" && v.vmUuid),
    [vms.data],
  );
  const sourceVm =
    mode === "clone" ? offVms.find((v) => v.id === sourceId) : undefined;
  const sourceTemplate =
    mode === "template"
      ? (templates.data ?? []).find((t) => t.id === sourceId)
      : undefined;
  const sourceName = sourceVm?.name ?? sourceTemplate?.name ?? "";

  // Hosts a template can be deployed to: its own host, plus its cluster's members.
  const templateHost = sourceTemplate
    ? (hosts.data ?? []).find((h) => h.id === sourceTemplate.hostId)
    : undefined;
  const templateHostOptions = React.useMemo(() => {
    if (!sourceTemplate) return [];
    const pool = (hosts.data ?? []).filter(
      (h) =>
        h.id === sourceTemplate.hostId ||
        (templateHost?.clusterId && h.clusterId === templateHost.clusterId),
    );
    return pool.map((h) => ({ value: h.id, label: h.name }));
  }, [sourceTemplate, hosts.data, templateHost?.clusterId]);

  // Candidate hosts for a brand-new VM: pinned host, else a cluster's members,
  // else everything.
  const newHostOptions = React.useMemo(() => {
    const all = hosts.data ?? [];
    const pool = clusterId ? all.filter((h) => h.clusterId === clusterId) : all;
    const runningOn = (hid: string) =>
      (vms.data ?? []).filter((v) => v.hostId === hid && v.state === "Running")
        .length;
    return pool
      .slice()
      .sort((a, b) => runningOn(a.id) - runningOn(b.id))
      .map((h) => ({
        value: h.id,
        label: `${h.name} - ${runningOn(h.id)} running`,
      }));
  }, [hosts.data, vms.data, clusterId]);

  // Default / constrain the host per mode.
  React.useEffect(() => {
    if (mode === "clone") {
      if (sourceVm && hostId !== sourceVm.hostId) setHostId(sourceVm.hostId);
      return;
    }
    if (mode === "template") {
      if (
        sourceTemplate &&
        !templateHostOptions.some((o) => o.value === hostId)
      ) {
        setHostId(sourceTemplate.hostId);
      }
      return;
    }
    // mode === 'new'
    if (hostId || lockedHostId || !newHostOptions.length) return;
    if (clusterId) setHostId(newHostOptions[0].value);
  }, [
    mode,
    sourceVm,
    sourceTemplate,
    templateHostOptions,
    hostId,
    newHostOptions,
    clusterId,
    lockedHostId,
  ]);

  // Prefill sizing from the selected clone / template source, once per source.
  const prefilledFor = React.useRef("");
  React.useEffect(() => {
    if (mode === "new") return;
    if (prefilledFor.current === `${mode}:${sourceId}`) return;
    if (sourceVm) {
      prefilledFor.current = `${mode}:${sourceId}`;
      setCpuCount(sourceVm.vcpu || 2);
      setMemoryMb(
        Math.max(
          256,
          Math.round(sourceVm.memory.assignedBytes / (1024 * 1024)),
        ),
      );
      setNotes(sourceVm.notes ?? "");
      const v = sourceVm.nics[0]?.vlanId;
      setVlanTag(v != null && v > 0 ? String(v) : "");
      setNested(sourceVm.nestedVirtualization);
    } else if (sourceTemplate) {
      prefilledFor.current = `${mode}:${sourceId}`;
      setCpuCount(sourceTemplate.cpuCount || 2);
      setMemoryMb(sourceTemplate.memoryMb || 4096);
      setNotes(sourceTemplate.notes ?? "");
    }
  }, [mode, sourceId, sourceVm, sourceTemplate]);

  const host = useQuery({ ...hostQuery(hostId), enabled: !!hostId });
  const isos = useQuery({
    ...hostIsosQuery(hostId),
    enabled: !!hostId && !isClone,
  });
  const vlans = useQuery({ ...vlansQuery({ hostId }), enabled: !!hostId });

  const selectedHost = (hosts.data ?? []).find((h) => h.id === hostId);
  const hostClusterId = clusterId ?? selectedHost?.clusterId ?? null;
  const isClusterHost = !!hostClusterId;

  // Pre-select the scope's default VLAN once, when the list first loads (only for
  // a brand-new VM - clone/deploy inherit the source's VLAN).
  const vlansLoadedFor = React.useRef<string>("");
  React.useEffect(() => {
    if (isClone || !vlans.data || vlansLoadedFor.current === hostId) return;
    vlansLoadedFor.current = hostId;
    const def = vlans.data.find((v) => v.isDefault);
    if (def) setVlanTag(String(def.vlanId));
  }, [vlans.data, hostId, isClone]);

  const vmSwitches = host.data?.hardware?.vSwitches ?? [];

  // Default the virtual switch to the first the host reports, once per host.
  const switchLoadedFor = React.useRef<string>("");
  React.useEffect(() => {
    if (!host.data || switchLoadedFor.current === hostId) return;
    switchLoadedFor.current = hostId;
    setSwitchName(vmSwitches[0]?.name ?? "");
  }, [host.data, hostId, vmSwitches]);

  const defaultVmPath = host.data?.hardware?.hyperv?.defaultVmPath ?? null;
  // Allowed placements: CSVs only on a clustered host, never the system drive.
  // The choice is always sent explicitly, so the agent never falls back to a
  // default VM path that may sit on C: or on a non-shared volume.
  const clustered = isClusterHost || isClusteredHost(host.data);
  const defKey = storageKey(defaultVmPath);
  const storages = React.useMemo(
    () => vmStorageTargets(host.data, clustered),
    [host.data, clustered],
  );
  const noStorage = !!host.data && storages.length === 0;

  React.useEffect(() => {
    if (storages.length === 0) {
      setStorageBase("");
      return;
    }
    const preferred =
      storages.find((s) => storageKey(s.path) === defKey) ??
      storages.reduce((a, b) => (b.freeBytes > a.freeBytes ? b : a));
    setStorageBase((prev) =>
      storages.some((s) => s.path === prev) ? prev : preferred.path,
    );
  }, [storages, defKey]);

  const destinationStorage = storageBase;
  const vmFolder = React.useMemo(
    () => previewVmFolder(defaultVmPath, destinationStorage, name),
    [defaultVmPath, destinationStorage, name],
  );

  // ---- validation ------------------------------------------------------
  const nameValid = NAME_RE.test(name);
  const step0Valid =
    nameValid &&
    !!hostId &&
    (mode === "new" || !!sourceId) &&
    !!destinationStorage;
  const disksValid = disks.every(
    (d) => DISK_NAME_RE.test(d.name) && d.name.length <= 6 && d.sizeGb >= 1,
  );
  const dynMemValid =
    !memoryDynamic ||
    (memoryMinMb >= 1024 &&
      memoryMinMb <= memoryMb &&
      memoryMaxMb >= memoryMb);
  const step1Valid =
    cpuCount >= 1 && memoryMb >= 256 && dynMemValid && (isClone || disksValid);

  const canAdvance = step === 0 ? step0Valid : step === 1 ? step1Valid : true;
  const pending = createVm.isPending || cloneVm.isPending;

  const goTo = (i: number) => {
    if (i <= maxReached) setStep(i);
  };
  const next = () => {
    if (!canAdvance) return;
    const n = Math.min(step + 1, 2);
    setStep(n);
    setMaxReached((m) => Math.max(m, n));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const changeMode = (m: Mode) => {
    if (sourceLocked || m === mode) return;
    setMode(m);
    setSourceId("");
    setExpandDisks(true);
    prefilledFor.current = "";
    setStep(0);
    setMaxReached(0);
    if (!lockedHostId && !clusterId) setHostId("");
  };

  const submit = () => {
    if (!step0Valid || !step1Valid) return;
    if (mode === "new") {
      const body: VmCreateBody = {
        name,
        hostId,
        os,
        firmware,
        cpuCount,
        memoryMb,
        memoryDynamic,
        memoryMinMb: memoryDynamic ? memoryMinMb : undefined,
        memoryMaxMb: memoryDynamic ? memoryMaxMb : undefined,
        destinationStorage: destinationStorage || undefined,
        notes: notes.trim() || undefined,
        vlanId: vlanTag ? Number(vlanTag) : null,
        switchName: switchName || null,
        nestedVirtualization: nested,
        haEnabled: isClusterHost && haEnabled,
        dvd: dvd || null,
        startNow,
        disks: disks.map((d) => ({
          name: d.name,
          type: d.type,
          sizeGb: d.sizeGb,
        })),
      };
      createVm.mutate(body, { onSuccess: () => organizeDialog.close() });
      return;
    }
    cloneVm.mutate(
      {
        name,
        hostId,
        source: mode === "template" ? "template" : "vm",
        sourceVmId: mode === "clone" ? sourceId : undefined,
        templateId: mode === "template" ? sourceId : undefined,
        cpuCount,
        memoryMb,
        destinationStorage: destinationStorage || undefined,
        notes: notes.trim() || undefined,
        vlanId: vlanTag ? Number(vlanTag) : null,
        nestedVirtualization: nested,
        haEnabled: isClusterHost && haEnabled,
        startNow,
        expandDisks: mode === "template" ? expandDisks : false,
      },
      { onSuccess: () => organizeDialog.close() },
    );
  };

  const vlanOptions = [
    { value: "", label: "Untagged" },
    ...(vlans.data ?? []).map((v) => ({
      value: String(v.vlanId),
      label: `${v.name} (VLAN ${v.vlanId})`,
    })),
  ];

  const isoOptions = [
    { value: "", label: "None" },
    ...(isos.data ?? []).map((i) => ({ value: i.path, label: i.name })),
  ];

  const sourceOptions =
    mode === "clone"
      ? offVms.map((v) => ({
          value: v.id,
          label: `${v.name} - ${hostName(v.hostId)}`,
        }))
      : (templates.data ?? [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((t) => ({
            value: t.id,
            label: `${t.name} - ${hostName(t.hostId)}${
              t.diskSizeBytes ? ` (${bytes(t.diskSizeBytes)})` : ""
            }`,
          }));

  return (
    <Dialog
      title={
        mode === "new"
          ? "Create Virtual Machine"
          : mode === "template"
            ? "Deploy VM from Template"
            : "Clone Virtual Machine"
      }
      onClose={organizeDialog.close}
      width={640}
      footer={
        <div className="flex flex-1 items-center justify-between">
          <Button onClick={() => organizeDialog.close()}>Cancel</Button>
          <div className="flex gap-2">
            {step > 0 && <Button onClick={back}>Back</Button>}
            {step < 2 ? (
              <Button onClick={next} disabled={!canAdvance}>
                Next
              </Button>
            ) : (
              <Button
                onClick={submit}
                disabled={!step0Valid || !step1Valid || pending}
                className="font-bold"
              >
                {mode === "new"
                  ? "Create VM"
                  : mode === "template"
                    ? "Deploy"
                    : "Clone"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex gap-4">
        <ol className="w-36 shrink-0 space-y-1">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => goTo(i)}
                disabled={i > maxReached}
                className={cn(
                  "flex w-full items-center gap-2 px-1.5 py-1 text-left text-base",
                  i === step && "bevel-thin-sunken bg-surface-2",
                  i > maxReached && "text-disabled-text",
                )}
              >
                <span
                  className={cn(
                    "bevel-thin-raised grid h-5 w-5 shrink-0 place-items-center bg-surface text-xs",
                    i < step && "bg-selection text-selection-text",
                  )}
                >
                  {i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        <div className="min-w-0 flex-1 space-y-3">
          {step === 0 && (
            <>
              {!sourceLocked ? (
                <div className="flex gap-1">
                  {(["new", "template", "clone"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => changeMode(m)}
                      className={cn(
                        "bevel-thin-raised flex-1 px-1.5 py-1 text-center text-base",
                        m === mode &&
                          "bevel-thin-sunken bg-surface-2 font-bold",
                      )}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              ) : null}

              {mode === "clone" ? (
                <label className="flex flex-col gap-1 text-base">
                  Source VM (powered off)
                  <Dropdown
                    value={sourceId}
                    onChange={setSourceId}
                    placeholder={
                      offVms.length ? "Select a VM…" : "No powered-off VMs"
                    }
                    options={sourceOptions}
                    disabled={sourceLocked}
                  />
                </label>
              ) : null}

              {mode === "template" ? (
                <label className="flex flex-col gap-1 text-base">
                  Template
                  <Dropdown
                    value={sourceId}
                    onChange={setSourceId}
                    placeholder={
                      (templates.data ?? []).length
                        ? "Select a template…"
                        : "No templates"
                    }
                    options={sourceOptions}
                    disabled={sourceLocked}
                  />
                </label>
              ) : null}

              <label className="flex flex-col gap-1 text-base">
                VM name
                <TextField
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="SRV-APP-01"
                />
                {name && !nameValid ? (
                  <span className="text-danger">
                    Letters, digits, - and _ only.
                  </span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1 text-base">
                Host
                {mode === "clone" ? (
                  <TextField
                    value={sourceVm ? hostName(sourceVm.hostId) : "-"}
                    disabled
                    readOnly
                  />
                ) : mode === "template" ? (
                  <Dropdown
                    value={hostId}
                    onChange={setHostId}
                    placeholder="Select a host…"
                    options={templateHostOptions}
                  />
                ) : lockedHostId ? (
                  <TextField
                    value={selectedHost?.name ?? hostId}
                    disabled
                    readOnly
                  />
                ) : (
                  <Dropdown
                    value={hostId}
                    onChange={setHostId}
                    placeholder="Select a host…"
                    options={newHostOptions}
                  />
                )}
              </label>

              {mode === "new" ? (
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1 text-base">
                    Operating system
                    <Dropdown
                      value={os}
                      onChange={(v) => setOs(v as VmOs)}
                      options={OS_OPTIONS}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-base">
                    Firmware
                    <Dropdown
                      value={firmware}
                      onChange={(v) => setFirmware(v as VmFirmware)}
                      options={[
                        { value: "UEFI", label: "UEFI" },
                        { value: "BIOS", label: "BIOS" },
                      ]}
                    />
                  </label>
                </div>
              ) : sourceName ? (
                <p className="text-disabled-text">
                  Disks, firmware and network adapters are copied from{" "}
                  <span className="font-bold">{sourceName}</span>.
                </p>
              ) : null}

              {noStorage ? (
                <p className="text-danger">
                  {clustered
                    ? "This host is in a cluster but reports no Cluster Shared Volume - VMs can only be placed on a CSV."
                    : "This host reports no storage volume for VMs - the system drive (C:) is only allowed when it holds the Hyper-V default VM path."}
                </p>
              ) : storages.length > 0 ? (
                <label className="flex flex-col gap-1 text-base">
                  {clustered ? "Cluster Shared Volume" : "Storage volume"}
                  <Dropdown
                    value={storageBase}
                    onChange={setStorageBase}
                    options={storages.map((s) => ({
                      value: s.path,
                      label: `${s.label ? `${s.label} - ` : ""}${s.path}${
                        storageKey(s.path) === defKey ? " (default)" : ""
                      } (${Math.round(s.freeBytes / 1024 ** 3)} GB free)`,
                    }))}
                  />
                </label>
              ) : null}

              {vmFolder ? (
                <p className="text-disabled-text">
                  VM path: <span className="font-mono">{vmFolder}</span>
                </p>
              ) : null}
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-[34fr_66fr] gap-3">
                <GroupBox label="CPU" className="space-y-3">
                  <label className="flex flex-col gap-1 text-base">
                    Virtual CPUs
                    <TextField
                      type="number"
                      min={1}
                      max={256}
                      value={cpuCount}
                      onChange={(e) =>
                        setCpuCount(Math.max(1, Number(e.target.value) || 1))
                      }
                    />
                  </label>
                  <Check
                    label="Nested virtualization"
                    checked={nested}
                    onChange={setNested}
                  />
                </GroupBox>

                <GroupBox label="Memory" className="space-y-3">
                  {mode === "new" ? (
                    <div className="flex gap-4">
                      <Radio
                        label="Dynamic"
                        name="mem-type"
                        checked={memoryDynamic}
                        onChange={() => {
                          setMemoryDynamic(true);
                          setMemoryMinMb((m) => Math.min(m, memoryMb));
                          setMemoryMaxMb((m) => Math.max(m, memoryMb));
                        }}
                      />
                      <Radio
                        label="Fixed"
                        name="mem-type"
                        checked={!memoryDynamic}
                        onChange={() => setMemoryDynamic(false)}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <label
                      className={cn(
                        "flex flex-col gap-1 text-base",
                        memoryDynamic ? "w-24" : "w-[106px]",
                      )}
                    >
                      {memoryDynamic ? "Startup (GB)" : "Memory (GB)"}
                      <TextField
                        type="number"
                        min={1}
                        step={1}
                        value={Math.round(memoryMb / 1024)}
                        onChange={(e) =>
                          setMemoryMb(
                            Math.max(1, Number(e.target.value) || 1) * 1024,
                          )
                        }
                      />
                    </label>

                    {mode === "new" && memoryDynamic ? (
                      <>
                        <label className="flex w-24 flex-col gap-1 text-base">
                          Min (GB)
                          <TextField
                            type="number"
                            min={1}
                            step={1}
                            value={Math.round(memoryMinMb / 1024)}
                            onChange={(e) =>
                              setMemoryMinMb(
                                Math.max(1, Number(e.target.value) || 1) *
                                  1024,
                              )
                            }
                          />
                        </label>
                        <label className="flex w-24 flex-col gap-1 text-base">
                          Max (GB)
                          <TextField
                            type="number"
                            min={1}
                            step={1}
                            value={Math.round(memoryMaxMb / 1024)}
                            onChange={(e) =>
                              setMemoryMaxMb(
                                Math.max(1, Number(e.target.value) || 1) *
                                  1024,
                              )
                            }
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                  {mode === "new" && memoryDynamic && !dynMemValid ? (
                    <p className="text-danger">
                      Need 1 GB ≤ minimum ≤ startup ({memoryMb / 1024} GB) ≤
                      maximum.
                    </p>
                  ) : null}
                </GroupBox>
              </div>

              {isClusterHost ? (
                <Check
                  label="Enable High Availability (HA)"
                  checked={haEnabled}
                  onChange={setHaEnabled}
                />
              ) : null}

              {mode === "new" ? (
                <GroupBox label="Disks" className="space-y-2">
                  {disks.map((d, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <label className="flex w-24 flex-col gap-1 text-base">
                        Name
                        <TextField
                          maxLength={6}
                          value={d.name}
                          onChange={(e) =>
                            setDisks((ds) =>
                              ds.map((x, j) =>
                                j === i ? { ...x, name: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="flex flex-1 flex-col gap-1 text-base">
                        Type
                        <Dropdown
                          value={d.type}
                          onChange={(v) =>
                            setDisks((ds) =>
                              ds.map((x, j) =>
                                j === i
                                  ? { ...x, type: v as VmDiskSpec["type"] }
                                  : x,
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
                          value={d.sizeGb}
                          onChange={(e) =>
                            setDisks((ds) =>
                              ds.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      sizeGb: Number(e.target.value) || 1,
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <Button
                        className="min-w-0 px-2"
                        disabled={disks.length === 1}
                        onClick={() =>
                          setDisks((ds) => ds.filter((_, j) => j !== i))
                        }
                      >
                        <Icon icon={Trash2} size={14} />
                      </Button>
                    </div>
                  ))}
                  {!disksValid ? (
                    <p className="text-danger">
                      Disk names must be alphanumeric, 1–6 characters.
                    </p>
                  ) : null}
                  <Button
                    className="min-w-0 px-2"
                    onClick={() =>
                      setDisks((ds) => [
                        ...ds,
                        { name: "", type: "Fixed", sizeGb: 60 },
                      ])
                    }
                  >
                    <Icon icon={Plus} size={14} />
                    Add disk
                  </Button>
                </GroupBox>
              ) : (
                <div className="space-y-2">
                  <p className="text-disabled-text">
                    Disks are copied from{" "}
                    <span className="font-bold">
                      {sourceName || "the source"}
                    </span>
                    .
                  </p>
                  {mode === "template" ? (
                    <Check
                      label="Expand disks to Fixed (full-size, better performance)"
                      checked={expandDisks}
                      onChange={setExpandDisks}
                    />
                  ) : null}
                </div>
              )}

              {mode === "new" ? (
                <label className="flex flex-col gap-1 text-base">
                  Virtual switch
                  <Dropdown
                    value={switchName}
                    onChange={setSwitchName}
                    placeholder={
                      vmSwitches.length
                        ? "Select a switch…"
                        : "No switches reported"
                    }
                    options={vmSwitches.map((s) => ({
                      value: s.name,
                      label: `${s.name}${s.type ? ` (${s.type})` : ""}`,
                    }))}
                  />
                </label>
              ) : null}

              <label className="flex flex-col gap-1 text-base">
                VLAN
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Dropdown
                      value={vlanTag}
                      onChange={setVlanTag}
                      options={vlanOptions}
                    />
                  </div>
                  <Button
                    className="min-w-0 px-2"
                    disabled={!hostId}
                    onClick={() => setShowAddVlan(true)}
                  >
                    <Icon icon={Plus} size={14} />
                    New VLAN
                  </Button>
                </div>
              </label>

              {mode === "new" ? (
                <label className="flex flex-col gap-1 text-base">
                  DVD drive (ISO)
                  <Dropdown
                    value={dvd}
                    onChange={setDvd}
                    options={isoOptions}
                  />
                </label>
              ) : null}

              <label className="flex flex-col gap-1 text-base">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="ui-field w-full resize-none px-1.5 py-[3px] text-base outline-none"
                />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <Check
                label={
                  mode === "new"
                    ? "Start the VM once it is created"
                    : "Start the VM once it is ready"
                }
                checked={startNow}
                onChange={setStartNow}
              />
              <table className="w-full text-base">
                <tbody>
                  {[
                    ["Mode", MODE_LABEL[mode]],
                    ...(isClone ? [["Source", sourceName] as const] : []),
                    ["Name", name],
                    ["Host", selectedHost?.name ?? hostId],
                    ...(mode === "new"
                      ? ([
                          ["Operating system", os],
                          ["Firmware", firmware],
                        ] as const)
                      : []),
                    ["Path", vmFolder || "(host default)"],
                    ["vCPUs", String(cpuCount)],
                    [
                      "Memory",
                      memoryDynamic
                        ? `${memoryMb / 1024} GB startup, dynamic ${memoryMinMb / 1024}–${memoryMaxMb / 1024} GB`
                        : `${memoryMb / 1024} GB`,
                    ],
                    ...(mode === "new"
                      ? ([
                          ["Virtual switch", switchName || "(host default)"],
                        ] as const)
                      : []),
                    ["Nested virtualization", nested ? "Yes" : "No"],
                    ...(isClusterHost
                      ? [
                          [
                            "High Availability",
                            haEnabled ? "Yes" : "No",
                          ] as const,
                        ]
                      : []),
                    [
                      "Disks",
                      mode === "new"
                        ? disks
                            .map(
                              (d) =>
                                `${d.name || "?"} (${d.type}, ${d.sizeGb} GB)`,
                            )
                            .join(", ")
                        : `inherited from ${sourceName || "source"}`,
                    ],
                    ...(mode === "template"
                      ? ([
                          [
                            "Disk allocation",
                            expandDisks
                              ? "Expand to Fixed"
                              : "Keep Dynamic (from template)",
                          ],
                        ] as const)
                      : []),
                    [
                      "VLAN",
                      vlanTag
                        ? (vlanOptions.find((o) => o.value === vlanTag)
                            ?.label ?? vlanTag)
                        : "Untagged",
                    ],
                    ...(mode === "new"
                      ? ([["DVD", dvd || "None"]] as const)
                      : []),
                    ...(notes.trim() ? [["Notes", notes.trim()] as const] : []),
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-surface-2 align-top">
                      <td className="py-1 pr-3 text-disabled-text whitespace-nowrap">
                        {k}
                      </td>
                      <td className="py-1 break-words font-mono">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {showAddVlan ? (
        <AddVlanDialog
          onClose={() => setShowAddVlan(false)}
          pending={createVlan.isPending}
          onCreate={(input) =>
            createVlan.mutate(
              isClusterHost
                ? { ...input, clusterId: hostClusterId ?? undefined }
                : { ...input, hostId },
              {
                onSuccess: (v) => {
                  setVlanTag(String(v.vlanId));
                  setShowAddVlan(false);
                },
              },
            )
          }
        />
      ) : null}
    </Dialog>
  );
}

function AddVlanDialog({
  onClose,
  onCreate,
  pending,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    vlanId: number;
    description?: string;
  }) => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [description, setDescription] = React.useState("");

  const tagNum = Number(tag);
  const valid = /^[a-zA-Z0-9_-]+$/.test(name) && tagNum >= 1 && tagNum <= 4094;

  return (
    <Dialog
      title="New VLAN"
      onClose={onClose}
      width={320}
      footer={
        <>
          <Button
            className="font-bold"
            disabled={!valid || pending}
            onClick={() =>
              onCreate({
                name: name.trim(),
                vlanId: tagNum,
                description: description.trim() || undefined,
              })
            }
          >
            Create
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-base">
          Name
          <TextField
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VLAN_100"
          />
        </label>
        <label className="flex flex-col gap-1 text-base">
          VLAN ID (1–4094)
          <TextField
            type="number"
            min={1}
            max={4094}
            value={tag}
            onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-28"
          />
        </label>
        <label className="flex flex-col gap-1 text-base">
          Description
          <TextField
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}
