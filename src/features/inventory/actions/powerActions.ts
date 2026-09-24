import { Pause, Play, Power, RotateCcw, Square, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { VmPowerAction, VmState } from "~/api/types";

export interface PowerActionDef {
  id: VmPowerAction;
  label: string;
  icon: LucideIcon;
  /** Tailwind text-color class for the icon. */
  color?: string;
  /** VM states from which this action is offered. */
  allowedStates: VmState[];
  confirm?: string;
  destructive?: boolean;
}

// classic transport-control colours
const GREEN = "text-success";
const RED = "text-danger";
const AMBER = "text-warning";

export const POWER_ACTIONS: PowerActionDef[] = [
  {
    id: "start",
    label: "Start",
    icon: Play,
    color: GREEN,
    allowedStates: ["Off", "Saved", "Paused"],
  },
  {
    id: "pause",
    label: "Pause",
    icon: Pause,
    color: AMBER,
    allowedStates: ["Running"],
  },
  {
    id: "shutdown",
    label: "Shut Down",
    icon: Power,
    allowedStates: ["Running"],
  },
  {
    id: "stop",
    label: "Turn Off",
    icon: Square,
    color: RED,
    allowedStates: ["Running", "Paused"],
    confirm: "Turn off this VM? Unsaved data in the guest will be lost.",
  },
  {
    id: "restart",
    label: "Restart",
    icon: RotateCcw,
    allowedStates: ["Running"],
    confirm: "Restart this VM?",
  },
  {
    id: "delete",
    label: "Delete",
    icon: Trash2,
    color: RED,
    allowedStates: ["Off", "Saved"],
    // delete has its own confirm flow (with the "remove files from disk"
    // checkbox) in VmPowerButtons - no generic `confirm` string here.
    destructive: true,
  },
];

export function actionsForState(state: VmState): PowerActionDef[] {
  return POWER_ACTIONS.filter((a) => a.allowedStates.includes(state));
}
