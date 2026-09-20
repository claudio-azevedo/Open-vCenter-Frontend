import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "~/api/client";
import { Button, GroupBox, PropertyList } from "~/components/win95";
import { hostAgentConfigQuery, hostAgentInstallQuery } from "~/api/queries";
import type { Host } from "~/api/types";

/**
 * Shown as the only tab while a host's agent has never checked in. Offers a
 * paste-ready elevated-PowerShell one-liner that installs the agent, plus the
 * `config.ini` it writes. Disappears once the agent responds (see HostDetail
 * tab logic).
 */
export function HostSetupAgentPanel({ host }: { host: Host }) {
  const cfg = useQuery(hostAgentConfigQuery(host.id));
  const install = useQuery(hostAgentInstallQuery(host.id));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base">
        This host has not been contacted by its agent yet. On{" "}
        <strong>{host.name}</strong>, open an <strong>elevated</strong>{" "}
        PowerShell and run the command below. It creates{" "}
        <code>C:\Program Files\ovc-agent</code>, downloads and checksums the
        agent, writes this <code>config.ini</code>, installs the Windows
        service, and opens the config in Notepad. Set the two storage paths,
        save, then <code>Start-Service ovc-agent</code>. This tab disappears
        once the agent checks in.
      </p>

      <GroupBox label="Install command (elevated PowerShell)">
        {install.isLoading ? (
          <p className="text-base text-disabled-text">Generating…</p>
        ) : install.isError ? (
          <p className="text-base text-title-active">
            Could not generate an install URL:{" "}
            {install.error instanceof ApiError
              ? install.error.message
              : String(install.error)}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base text-disabled-text">
                Link valid until {formatExpiry(install.data?.expiresAt)} -
                anyone with it can pull the script.
              </span>
              <div className="flex gap-2">
                <Button
                  className="min-w-0 px-2"
                  disabled={install.isFetching}
                  onClick={() => install.refetch()}
                >
                  Regenerate
                </Button>
                <CopyButton text={install.data?.command ?? ""} label="Copy" />
              </div>
            </div>
            <textarea
              readOnly
              spellCheck={false}
              value={install.data?.command ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              className="bevel-sunken h-24 w-full resize-none bg-window p-2 font-mono text-base text-black outline-none"
            />
          </div>
        )}
      </GroupBox>

      <GroupBox label="Host">
        <PropertyList
          items={[
            // the `host_id` written to config.ini / used as the RabbitMQ queue
            // prefix - the handle to cross-reference, not the DB UUID
            { label: "Host ID", value: host.shortId },
            { label: "FQDN", value: host.fqdn ?? "Pending agent" },
            {
              label: "RabbitMQ",
              value: cfg.data ? redactUrl(cfg.data.rabbitmqUrl) : "-",
            },
          ]}
        />
      </GroupBox>

      <GroupBox label="config.ini">
        {cfg.isLoading ? (
          <p className="text-base text-disabled-text">Loading…</p>
        ) : cfg.isError ? (
          <p className="text-base text-title-active">
            Could not load the agent config:{" "}
            {cfg.error instanceof ApiError ? cfg.error.message : String(cfg.error)}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <CopyButton text={cfg.data?.configIni ?? ""} label="Copy" />
            </div>
            <textarea
              readOnly
              spellCheck={false}
              value={cfg.data?.configIni ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              className="bevel-sunken h-72 w-full resize-none bg-window p-2 font-mono text-base text-black outline-none"
            />
          </div>
        )}
      </GroupBox>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - the text is selectable in the box */
    }
  };
  return (
    <Button className="min-w-0 px-2" onClick={copy}>
      {copied ? "Copied" : label}
    </Button>
  );
}

function formatExpiry(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Hide the password in the displayed URL (it is still in the copied config.ini). */
function redactUrl(url: string): string {
  return url.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1••••••$2");
}
