import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  GroupBox,
  Icon,
  Table,
  Td,
  Th,
  TextField,
} from "~/components/win95";
import {
  agentBinariesQuery,
  agentStorageQuery,
  hostsQuery,
} from "~/api/queries";
import {
  deleteAgentBinary,
  rolloutAgentBinary,
  updateAgentBinary,
  uploadAgentBinary,
} from "~/api/endpoints/agentBinaries";
import { updateHostAgent } from "~/api/endpoints/hosts";
import { ApiError } from "~/api/client";
import type { AgentBinary } from "~/api/types";
import { bytes, relTime } from "../format";
import { confirm } from "../confirm";
import { organizeDialog } from "./dialogStore";
import { activeTasks } from "../actions/activeTasks";
import { statusMessage } from "../actions/statusMessage";

export function AgentManagementDialog() {
  const qc = useQueryClient();
  const binaries = useQuery(agentBinariesQuery());
  const storage = useQuery(agentStorageQuery());
  const hosts = useQuery(hostsQuery());

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agent-binaries"] });
    qc.invalidateQueries({ queryKey: ["hosts"] });
  };
  const onError = (err: unknown) =>
    statusMessage.set(err instanceof ApiError ? err.message : String(err));

  const upload = useMutation({
    mutationFn: uploadAgentBinary,
    onSuccess: (b) => {
      refresh();
      statusMessage.set(`Uploaded agent ${b.version}`);
    },
    onError,
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; isActive?: boolean; notes?: string }) =>
      updateAgentBinary(v.id, { isActive: v.isActive, notes: v.notes }),
    onSuccess: () => refresh(),
    onError,
  });
  const remove = useMutation({
    mutationFn: deleteAgentBinary,
    onSuccess: () => {
      refresh();
      statusMessage.set("Agent binary deleted");
    },
    onError,
  });
  const updateOne = useMutation({
    mutationFn: (hostId: string) => updateHostAgent(hostId),
    onSuccess: ({ task }) => {
      activeTasks.add(task.id);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      statusMessage.set(
        `Agent upgrade queued for ${task.targetName ?? "host"}`,
      );
    },
    onError,
  });
  const rollout = useMutation({
    mutationFn: (id: string) => rolloutAgentBinary(id),
    onSuccess: (res) => {
      res.tasks.forEach((t) => activeTasks.add(t.id));
      qc.invalidateQueries({ queryKey: ["tasks"] });
      statusMessage.set(
        `Rollout: ${res.tasks.length} queued, ${res.skipped.length} skipped`,
      );
    },
    onError,
  });

  const list = binaries.data ?? [];
  const activeByHv = React.useMemo(() => {
    const m: Record<string, AgentBinary> = {};
    for (const b of list) if (b.isActive) m[b.hypervisor] = b;
    return m;
  }, [list]);

  const removeBinary = async (b: AgentBinary) => {
    const ok = await confirm({
      title: "Delete Agent Binary",
      message: `Delete agent ${b.version} (${b.hypervisor})? Hosts already running it are unaffected.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) remove.mutate(b.id);
  };
  const promote = async (b: AgentBinary) => {
    if (b.isActive) return;
    const ok = await confirm({
      title: "Set Active Build",
      message: `Make ${b.version} the active ${b.hypervisor} build? New host bundles and "Update all outdated" will use it.`,
      confirmLabel: "Set active",
    });
    if (ok) patch.mutate({ id: b.id, isActive: true });
  };
  const doRollout = async (b: AgentBinary) => {
    const outdated = (hosts.data ?? []).filter(
      (h) =>
        h.hypervisor === b.hypervisor &&
        h.agent.connected &&
        h.agent.version !== b.version,
    );
    const ok = await confirm({
      title: "Update all outdated hosts",
      message: `Queue an agent upgrade to ${b.version} on ${outdated.length} online host(s)?`,
      confirmLabel: "Update all",
    });
    if (ok) rollout.mutate(b.id);
  };

  return (
    <Dialog
      title="Agent Management"
      onClose={organizeDialog.close}
      width={640}
      footer={<Button onClick={() => organizeDialog.close()}>Close</Button>}
    >
      <div className="flex flex-col gap-3">
        <GroupBox label="Binary storage">
          <p className="text-base text-disabled-text">
            {storage.isLoading
              ? "Loading…"
              : storage.data
                ? `${storage.data.backend === "s3" ? "Object storage" : "Local directory"} - ${storage.data.location}`
                : "Unavailable"}
          </p>
          {storage.data && !storage.data.downloadsEnabled ? (
            <p className="text-base text-title-active">
              Downloads disabled - set OVC_PUBLIC_BASE_URL so hosts can fetch
              the binary. Upgrades will fail until then.
            </p>
          ) : null}
        </GroupBox>

        <GroupBox label="Uploaded builds">
          <UploadRow
            busy={upload.isPending}
            onUpload={(v) => upload.mutate(v)}
          />
          <Table wrapperClassName="mt-2 max-h-[220px]">
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Hypervisor</Th>
                <Th className="text-right">Size</Th>
                <Th>Uploaded</Th>
                <Th className="w-[64px] text-center">Active</Th>
                <Th className="w-[112px]"> </Th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="text-disabled-text">
                    {binaries.isLoading
                      ? "Loading…"
                      : "No agent binaries uploaded yet."}
                  </Td>
                </tr>
              ) : (
                list.map((b) => (
                  <tr key={b.id} className="border-t border-surface-2">
                    <Td title={b.checksumSha256}>{b.version}</Td>
                    <Td>{b.hypervisor}</Td>
                    <Td className="text-right">{bytes(b.sizeBytes)}</Td>
                    <Td title={b.uploadedBy}>{relTime(b.createdAt)}</Td>
                    <Td className="text-center">
                      <input
                        type="radio"
                        name={`active-${b.hypervisor}`}
                        checked={b.isActive}
                        onChange={() => promote(b)}
                        aria-label={`Set ${b.version} active`}
                      />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button
                          title="Update all outdated hosts to this build"
                          className="min-h-0 min-w-0 px-1.5 py-[2px]"
                          disabled={rollout.isPending}
                          onClick={() => doRollout(b)}
                        >
                          Roll out
                        </Button>
                        <Button
                          title="Delete"
                          aria-label={`Delete ${b.version}`}
                          className="min-h-0 min-w-0 px-1.5 py-[2px]"
                          disabled={b.isActive || remove.isPending}
                          onClick={() => removeBinary(b)}
                        >
                          <Icon icon={Trash2} size={13} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </GroupBox>

        <GroupBox label="Hosts">
          <Table wrapperClassName="max-h-[220px]">
            <thead>
              <tr>
                <Th>Host</Th>
                <Th>Agent</Th>
                <Th>Target</Th>
                <Th className="w-[96px]"> </Th>
              </tr>
            </thead>
            <tbody>
              {(hosts.data ?? []).length === 0 ? (
                <tr>
                  <Td colSpan={4} className="text-disabled-text">
                    {hosts.isLoading ? "Loading…" : "No hosts."}
                  </Td>
                </tr>
              ) : (
                (hosts.data ?? []).map((h) => {
                  const target = activeByHv[h.hypervisor];
                  const current = h.agent.version ?? "-";
                  const upToDate = target && h.agent.version === target.version;
                  return (
                    <tr key={h.id} className="border-t border-surface-2">
                      <Td>{h.name}</Td>
                      <Td
                        className={
                          h.agent.connected ? "" : "text-disabled-text"
                        }
                      >
                        {current}
                        {!h.agent.connected ? " (offline)" : ""}
                      </Td>
                      <Td>
                        {!target ? (
                          <span className="text-disabled-text">
                            no active build
                          </span>
                        ) : upToDate ? (
                          <span className="inline-flex items-center gap-1 text-disabled-text">
                            <Icon icon={Check} size={12} /> up to date
                          </span>
                        ) : (
                          target.version
                        )}
                      </Td>
                      <Td>
                        <Button
                          className="min-h-0 min-w-0 px-2 py-[2px]"
                          disabled={
                            !target ||
                            !!upToDate ||
                            !h.agent.connected ||
                            updateOne.isPending
                          }
                          onClick={() => updateOne.mutate(h.id)}
                        >
                          Update
                        </Button>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </GroupBox>
      </div>
    </Dialog>
  );
}

function UploadRow({
  busy,
  onUpload,
}: {
  busy: boolean;
  onUpload: (v: {
    file: File;
    version: string;
    notes?: string;
    makeActive?: boolean;
  }) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [version, setVersion] = React.useState("");
  const [makeActive, setMakeActive] = React.useState(true);

  const submit = () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !version.trim()) return;
    onUpload({ file, version: version.trim(), makeActive });
    setVersion("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-base">
        Binary
        <input ref={fileRef} type="file" className="text-base" />
      </label>
      <TextField
        label="Version"
        placeholder="e.g. 1.2.0"
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        className="w-28"
      />
      <label className="flex items-center gap-1 pb-1 text-base">
        <input
          type="checkbox"
          checked={makeActive}
          onChange={(e) => setMakeActive(e.target.checked)}
        />
        Set active
      </label>
      <Button className="mb-[1px]" disabled={busy} onClick={submit}>
        {busy ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
}
