import type { Vm } from "~/api/types";

const GIB = 1024 ** 3;

/** Parent directory of a Windows/UNC path (no trailing slash). */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}

/**
 * Where a newly-added disk file should live: next to the VM's existing disks
 * (the "Virtual Hard Disks" folder), matching the create-VM convention
 * `<vmFolder>\Virtual Hard Disks\<vmName>-<diskName>.vhdx`.
 * Returns `null` when the VM has no disk to anchor on.
 */
export function newDiskPath(
  vm: Pick<Vm, "name" | "disks">,
  diskName: string,
): string | null {
  const anchor = vm.disks[0]?.path;
  if (!anchor) return null;
  const suffix = diskName ? `${vm.name}-${diskName}.vhdx` : `${vm.name}.vhdx`;
  return `${dirOf(anchor)}\\${suffix}`;
}

/** Current provisioned size of a disk in GiB (rounded up - the agent compares bytes). */
export function diskSizeGb(sizeBytes: number): number {
  return Math.ceil(sizeBytes / GIB);
}

/** `true` when a disk sits at controller location 0:0 - the boot disk, never removable. */
export function isBootDisk(controller: string | null | undefined): boolean {
  return /(?:^|\s)0:0$/.test((controller ?? "").trim());
}
