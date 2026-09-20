import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { MonitorOff } from "lucide-react";
import {
  Button,
  ClientOnly,
  GroupBox,
  Icon,
  TextField,
} from "~/components/win95";
import type { Vm } from "~/api/types";
import { hostQuery } from "~/api/queries";
import { GuacamoleConsole } from "./GuacamoleConsole";
import { ConsoleVmActions } from "./ConsoleVmActions";
import { TUNNEL_URL, vmConsoleTabUrl } from "./webrdp";

/**
 * `standalone` - rendered by the `/console` route in its own browser tab (fills
 * the viewport, drops the redundant "open in a new tab" link). Default is the
 * embedded Console tab inside the Explorer.
 */
export function VmConsolePanel({
  vm,
  standalone = false,
}: {
  vm: Vm;
  standalone?: boolean;
}) {
  const host = useQuery(hostQuery(vm.hostId));
  const [session, setSession] = React.useState<{
    username: string;
    password: string;
  } | null>(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  if (!host.data && !host.isError) {
    return <div className="p-3 text-disabled-text">Loading host…</div>;
  }

  const fqdn = host.data?.fqdn ?? host.data?.ipAddress ?? null;
  if (!fqdn || !vm.vmUuid) {
    return (
      <div className="bevel-sunken flex h-full min-h-[240px] flex-col items-center justify-center gap-2 bg-black text-[#00ff00]">
        <Icon icon={MonitorOff} size={32} className="text-[#00aa00]" />
        <p>
          {!vm.vmUuid
            ? "Console unavailable - waiting for the host agent to report this VM."
            : "Console unavailable - the host agent has not reported an address yet."}
        </p>
      </div>
    );
  }
  const vmGuid = vm.vmUuid;

  if (session) {
    return (
      <ClientOnly
        fallback={
          <div className="p-3 text-disabled-text">Loading console…</div>
        }
      >
        <GuacamoleConsole
          tunnelUrl={TUNNEL_URL}
          hostname={fqdn}
          port="2179"
          vmGuid={vmGuid}
          vmName={vm.name}
          username={session.username}
          password={session.password}
          onExit={() => setSession(null)}
          toolbarExtra={<ConsoleVmActions vm={vm} />}
        />
      </ClientOnly>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-3">
      <form
        className="w-full max-w-xs"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          setSession({ username, password });
        }}
      >
        <GroupBox label="Hyper-V Console">
          <div className="flex flex-col gap-3 p-1">
            <p className="text-base">
              {vm.name} ·{" "}
              <span className="text-disabled-text">{fqdn}:2179</span>
            </p>
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="administrator or user@domain"
              autoComplete="off"
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <div className="flex items-center justify-between">
              {standalone ? (
                <span />
              ) : (
                <a
                  href={vmConsoleTabUrl(vm.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-base underline"
                >
                  Open in a new tab
                </a>
              )}
              <Button type="submit">Connect</Button>
            </div>
          </div>
        </GroupBox>
      </form>
    </div>
  );
}
