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
 * Storage volumes a VM could be moved to: the allowed placements for its host
 * (see `vmStorageTargets`), minus the volume it is on now.
 */
export function moveStorageTargets(
  host: HostDetail | undefined,
  vm: Pick<Vm, "configPath" | "disks">,
): StorageVolume[] {
  const current = vmStorageKey(vm);
  return vmStorageTargets(host, isClusteredHost(host)).filter(
    (s) => storageKey(s.path) !== current,
  );
}

/**
 * Storage volumes a VM may be placed on (create / clone / deploy / move):
 * - clustered host: only Cluster Shared Volumes;
 * - standalone host: every reported volume, except the system drive (C:) unless
 *   the Hyper-V default VM path is on it - the agent then places the VM under
 *   that default path, never at the drive root.
 * Mirrors the backend's placement check. One entry per location.
 */
export function vmStorageTargets(
  host: HostDetail | undefined,
  clustered: boolean,
): StorageVolume[] {
  const defaultOnC =
    storageKey(host?.hardware?.hyperv?.defaultVmPath) === "c:";
  const seen = new Set<string>();
  const out: StorageVolume[] = [];
  for (const s of host?.hardware?.storage ?? []) {
    const key = storageKey(s.path);
    const allowed = clustered
      ? key.includes("\\clusterstorage\\")
      : key !== "c:" || defaultOnC;
    if (!allowed || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Whether the host belongs to a cluster (by assignment or as it reports). */
export function isClusteredHost(
  host: Pick<HostDetail, "clusterId" | "hardware"> | undefined,
): boolean {
  return !!(host?.clusterId || host?.hardware?.cluster?.clustered);
}
