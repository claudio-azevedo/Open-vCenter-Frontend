import { MonitorOff } from "lucide-react";
import { Icon } from "~/components/win95";

/** The black "no console" screen shared by the VM and host console panels. */
export function ConsoleUnavailable({ message }: { message: string }) {
  return (
    <div className="bevel-sunken flex h-full min-h-[240px] flex-col items-center justify-center gap-2 bg-console-bg p-3 text-center text-console-fg">
      <Icon icon={MonitorOff} size={32} className="text-console-muted" />
      <p>{message}</p>
    </div>
  );
}

export const DEMO_CONSOLE_MESSAGE =
  "Console unavailable in demo mode - there is no real host to connect to.";
