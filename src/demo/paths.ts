/**
 * Windows path rules the simulator mirrors from ovc-backend / ovc-agent: where a
 * VM's folder lands (`resolveVMFolder`) and which volumes may hold a VM
 * (`_require_vm_storage_allowed`). The frontend's own copy of the placement rule
 * lives in `features/inventory/detail/vmActions/storage.ts`.
 */

const VOLUME_RE = /^([a-zA-Z]):/;
const CSV_RE = /^([a-zA-Z]:\\ClusterStorage\\[^\\]+)/i;

const trimSlashes = (p: string) => p.replace(/[\\/]+$/, "");

/** "c:" for a drive path, the lowercased CSV root for a cluster volume. */
export function volumeKey(path: string | null | undefined): string {
  const s = trimSlashes((path ?? "").replace(/\//g, "\\"));
  const csv = CSV_RE.exec(s);
  if (csv) return csv[1].toLowerCase();
  const drive = VOLUME_RE.exec(s);
  return drive ? `${drive[1].toLowerCase()}:` : s.toLowerCase();
}

export const isCsvPath = (path: string) => CSV_RE.test(path);

/** The folder the agent creates for a VM (mirror of `resolveVMFolder`). */
export function vmFolderFor(
  defaultVmPath: string,
  destination: string | null | undefined,
  name: string,
): string {
  const def = trimSlashes(defaultVmPath);
  const dest = trimSlashes(destination ?? "");
  if (!dest) return `${def}\\${name}`;
  const csv = CSV_RE.exec(dest);
  if (csv) return `${csv[1]}\\VMS\\${name}`;
  if (volumeKey(def) === volumeKey(dest)) return `${def}\\${name}`;
  const vol = VOLUME_RE.exec(dest)?.[0];
  return vol ? `${vol}\\HyperV\\VMS\\${name}` : `${dest}\\VMS\\${name}`;
}

/**
 * The backend's placement check: a clustered host takes only Cluster Shared
 * Volumes; a standalone host anything but the system drive, unless the Hyper-V
 * default VM path is on it. Returns an error message, or null when allowed.
 */
export function placementError(
  clustered: boolean,
  defaultVmPath: string,
  destination: string | null | undefined,
): string | null {
  const dest = trimSlashes(destination ?? "") || defaultVmPath;
  if (clustered) {
    return isCsvPath(dest)
      ? null
      : `This host is in a cluster - VMs must be placed on a Cluster Shared Volume, not '${dest}'`;
  }
  if (volumeKey(dest) === "c:" && volumeKey(defaultVmPath) !== "c:") {
    return `VMs cannot be placed on the system drive ('${dest}')`;
  }
  return null;
}

export const diskFileName = (vmName: string, diskName: string) =>
  diskName ? `${vmName}-${diskName}.vhdx` : `${vmName}.vhdx`;
