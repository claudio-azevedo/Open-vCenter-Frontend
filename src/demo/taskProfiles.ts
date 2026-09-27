/**
 * How long each simulated agent function takes and what it reports while
 * running. Durations are short on purpose - a demo should feel responsive -
 * except the long exports/moves, which show a live progress bar.
 */
export interface TaskProfile {
  runMs: number;
  steps: string[];
}

const P = (seconds: number, ...steps: string[]): TaskProfile => ({
  runMs: seconds * 1000,
  steps,
});

export const TASK_PROFILES: Record<string, TaskProfile> = {
  // VM power
  vm_start: P(3, "Starting VM", "Waiting for heartbeat"),
  vm_stop: P(2, "Turning off VM"),
  vm_shutdown: P(4, "Sending shutdown to the guest", "Waiting for the guest OS"),
  vm_restart: P(5, "Restarting guest", "Waiting for heartbeat"),
  vm_pause: P(1.5, "Pausing VM"),
  vm_delete: P(3, "Removing VM", "Cleaning up"),
  // VM lifecycle
  vm_create: P(10, "Creating VM", "Creating virtual disks", "Configuring network", "Applying settings"),
  vm_clone: P(15, "Exporting source", "Copying virtual disks", "Importing VM", "Applying settings"),
  vm_edit: P(3, "Applying settings"),
  vm_rename: P(2, "Renaming VM"),
  vm_migrate: P(8, "Live migration in progress", "Switching over"),
  vm_move: P(12, "Moving storage", "Updating configuration"),
  vm_startup_change: P(1.5, "Updating AutoStart"),
  vm_export_template: P(20, "Preparing export", "Exporting VM", "Registering template"),
  notes_edit: P(1, "Saving notes"),
  mount_dvd: P(1.5, "Mounting ISO"),
  eject_dvd: P(1.5, "Ejecting ISO"),
  enable_ha: P(4, "Adding cluster role"),
  disable_ha: P(4, "Removing cluster role"),
  snapshot_create: P(3, "Creating checkpoint"),
  snapshot_remove: P(4, "Merging checkpoint"),
  snapshot_restore: P(5, "Applying checkpoint"),
  vm_enable_metrics: P(1.5, "Enabling resource metering"),
  vm_disable_metrics: P(1.5, "Disabling resource metering"),
  refresh_status: P(1, "Refreshing VM"),
  // host
  refresh_hardware: P(3, "Collecting hardware inventory"),
  refresh_inventory: P(3, "Collecting VM inventory"),
  suspend: P(4, "Pausing node"),
  suspend_drain: P(10, "Draining roles", "Pausing node"),
  resume: P(3, "Resuming node"),
  resume_fallback: P(8, "Resuming node", "Failing back roles"),
  restart: P(25, "Rebooting host", "Waiting for the host to come back"),
  host_update_agent: P(10, "Downloading agent", "Verifying checksum", "Restarting agent"),
};

/** Labels are long-running enough to show a percentage next to the step. */
export const SHOW_PERCENT_FROM_MS = 8_000;

export function taskProfile(kind: string): TaskProfile {
  return TASK_PROFILES[kind] ?? P(2, "Working");
}
