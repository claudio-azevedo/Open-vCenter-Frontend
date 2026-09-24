import {
  Folder,
  Layers,
  Package,
  Pause,
  Play,
  Server,
  ServerOff,
  Square,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "~/components/win95";
import { TRANSITIONAL_VM_STATES } from "~/api/types";
import type { VmState } from "~/api/types";

export function ClusterIcon() {
  return <Icon icon={Layers} size={16} className="text-accent" />;
}

export function HostIcon({ online }: { online: boolean }) {
  return online ? (
    <Icon icon={Server} size={16} className="text-fg" />
  ) : (
    <Icon icon={ServerOff} size={16} className="text-disabled-text" />
  );
}

export function FolderIcon() {
  return <Icon icon={Folder} size={16} className="text-warning" />;
}

export function TemplateIcon() {
  return <Icon icon={Package} size={14} className="text-info" />;
}

const GREEN = "text-success";
const RED = "text-danger";
const AMBER = "text-warning";
const BLUE = "text-info";
const GRAY = "text-disabled-text";

// Same transport-control icons as the power buttons - play / square / pause.
const STATE_ICON: Record<VmState, { icon: LucideIcon; color: string }> = {
  Running: { icon: Play, color: GREEN },
  Off: { icon: Square, color: RED },
  Paused: { icon: Pause, color: AMBER },
  Saved: { icon: Square, color: BLUE },
  Unknown: { icon: Square, color: GRAY },
  Starting: { icon: Play, color: GREEN },
  Resuming: { icon: Play, color: GREEN },
  Restarting: { icon: Play, color: GREEN },
  Stopping: { icon: Square, color: RED },
  Saving: { icon: Square, color: BLUE },
  Pausing: { icon: Pause, color: AMBER },
  Deleting: { icon: Square, color: RED },
};

export function VmIcon({ state }: { state: VmState }) {
  const { icon, color } = STATE_ICON[state] ?? STATE_ICON.Unknown;
  const transitional = TRANSITIONAL_VM_STATES.has(state);
  return (
    <Icon
      icon={icon}
      size={13}
      className={`${color} ${transitional ? "animate-pulse" : ""}`}
    />
  );
}
