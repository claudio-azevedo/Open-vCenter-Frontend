import * as React from "react";
import {
  Button,
  ClientOnly,
  GroupBox,
  TextField,
} from "~/components/win95";
import type { Host } from "~/api/types";
import { GuacamoleConsole } from "./GuacamoleConsole";
import { TUNNEL_URL } from "./webrdp";
import { ConsoleUnavailable, DEMO_CONSOLE_MESSAGE } from "./ConsoleUnavailable";
import { isDemoMode } from "~/demo/mode";

/**
 * Standard RDP (port 3389) to the Hyper-V host itself, through the same
 * Guacamole tunnel the VM console uses - no preconnection blob.
 * Rendered by the `/console?host=<id>` route (opened from the host action bar).
 */
export function HostConsolePanel({ host }: { host: Host }) {
  const [session, setSession] = React.useState<{
    username: string;
    password: string;
  } | null>(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  const addr = host.fqdn ?? host.ipAddress ?? null;
  if (isDemoMode()) return <ConsoleUnavailable message={DEMO_CONSOLE_MESSAGE} />;
  if (!addr) {
    return (
      <ConsoleUnavailable message="Console unavailable - the host agent has not reported an address yet." />
    );
  }

  if (session) {
    return (
      <ClientOnly
        fallback={
          <div className="p-3 text-disabled-text">Loading console…</div>
        }
      >
        <GuacamoleConsole
          tunnelUrl={TUNNEL_URL}
          hostname={addr}
          port="3389"
          security="any"
          vmName={host.name}
          username={session.username}
          password={session.password}
          onExit={() => setSession(null)}
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
        <GroupBox label="Host Console (RDP)">
          <div className="flex flex-col gap-3 p-1">
            <p className="text-base">
              {host.name} ·{" "}
              <span className="text-disabled-text">{addr}:3389</span>
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
            <div className="flex justify-end">
              <Button type="submit">Connect</Button>
            </div>
          </div>
        </GroupBox>
      </form>
    </div>
  );
}
