import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Monitor } from "lucide-react";
import { Button, GroupBox, Icon } from "~/components/win95";
import type { HostDetail, Vm } from "~/api/types";
import { vmThumbnailQuery } from "~/api/queries";
import { dateTime, relTime } from "../../format";
import { downloadVmConsoleRdpFile } from "./rdpFile";
import { vmConsoleStateBlock, vmConsoleTabUrl } from "./webrdp";

/**
 * Summary tab "Console" box: the last console thumbnail the agent captured,
 * "Open Web Console" (the HTML5 console, `/console?vm=`, in a new browser tab)
 * and "Download RDP" (a `.rdp` file for the native Windows client). The agent only captures Running
 * VMs; an Off VM has no screen, so it shows the "No preview" placeholder instead
 * of its last (stale) image and the thumbnail is not fetched.
 */
export function VmConsoleBox({
  vm,
  host,
  className,
}: {
  vm: Vm;
  host: HostDetail | undefined;
  className?: string;
}) {
  const off = vm.state === "Off";
  const thumb = useQuery({ ...vmThumbnailQuery(vm.id, vm.lastSeen), enabled: !off });
  const blob = off ? undefined : thumb.data?.blob;
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!blob) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  // Both ways in need a reachable host address, the VM's Hyper-V GUID and a VM
  // that has a screen (not Off / Paused).
  const consoleAddr = host?.fqdn ?? host?.ipAddress ?? null;
  const unavailable = !host
    ? "Host not loaded"
    : !host.online
      ? "Host agent is offline"
      : !consoleAddr
        ? "Host has no FQDN or IP address"
        : !vm.vmUuid
          ? "VM not reported by the agent yet"
          : vmConsoleStateBlock(vm.state);

  const capturedAt = thumb.data?.capturedAt;

  return (
    <GroupBox label="Console" className={className}>
      <div className="flex flex-col gap-2">
        <div className="bevel-thin-sunken bg-console-bg flex aspect-[4/3] w-full items-center justify-center overflow-hidden">
          {src ? (
            <img
              src={src}
              alt={`${vm.name} console`}
              title={
                capturedAt
                  ? `Captured ${dateTime(capturedAt)} (${relTime(capturedAt)})`
                  : undefined
              }
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-console-fg">
              <Icon icon={Monitor} size={28} className="text-console-muted" />
              <span>{!off && thumb.isPending ? "Loading…" : "No preview"}</span>
              {off ? <span className="text-console-muted">VM is off</span> : null}
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            icon={ExternalLink}
            disabled={!!unavailable}
            title={unavailable ?? "Open the HTML5 console in a new tab"}
            onClick={() =>
              window.open(vmConsoleTabUrl(vm.id), "_blank", "noopener")
            }
          >
            Open Web Console
          </Button>
          <Button
            icon={Download}
            disabled={!!unavailable}
            title={unavailable ?? "Download a .rdp file for the Windows client"}
            onClick={() =>
              consoleAddr && downloadVmConsoleRdpFile(vm, consoleAddr)
            }
          >
            Download RDP
          </Button>
        </div>
      </div>
    </GroupBox>
  );
}
