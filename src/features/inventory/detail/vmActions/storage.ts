import type { HostDetail, Vm } from "~/api/types";

type StorageVolume = NonNullable<HostDetail["hardware"]>["storage"][number];

/**
 * A stable key for "which storage location is this path on" - the CSV volume
 * (`C:\ClusterStorage\Volume1`) for cluster paths, otherwise the drive letter.
 * Used to tell whether a move destination is actually different from where the
 * VM lives now.
 */
export function storageKey(path: string | null | undefined): string {
  const s = (path ?? "").replace(/\//g, "\\").replace(/\\+$/, "");
  const csv = /^([a-zA-Z]:\\ClusterStorage\\[^\\]+)/i.exec(s);
  if (csv) return csv[1].toLowerCase();
  const drive = /^([a-zA-Z]):/.exec(s);
  return drive ? `${drive[1].toLowerCase()}:` : s.toLowerCase();
}

/** Where the VM currently lives (config folder, else its first disk). */
export function vmStorageKey(vm: Pick<Vm, "configPath" | "disks">): string {
  return storageKey(vm.configPath || vm.disks[0]?.path || "");
}

/**
 * Storage volumes a VM could be moved to: everything the host reports (already
 * scoped by the agent to the default VM path + configured `aditional_vm_storage`
 * + cluster CSVs), minus the volume it is on now. One entry per location.
 */
export function moveStorageTargets(
  host: HostDetail | undefined,
  vm: Pick<Vm, "configPath" | "disks">,
): StorageVolume[] {
  const current = vmStorageKey(vm);
  const seen = new Set<string>();
  const out: StorageVolume[] = [];
  for (const s of host?.hardware?.storage ?? []) {
    const key = storageKey(s.path);
    if (key === current || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
