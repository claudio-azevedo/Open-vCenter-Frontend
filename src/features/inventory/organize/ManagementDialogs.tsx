import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Button,
  Dialog,
  Dropdown,
  Icon,
  Table,
  Td,
  TextField,
  Th,
} from "~/components/win95";
import { clustersQuery, hostsQuery } from "~/api/queries";
import type { Host } from "~/api/types";
import { confirm } from "../confirm";
import { organizeDialog } from "./dialogStore";
import {
  useCreateCluster,
  useCreateHost,
  useDeleteCluster,
  useDeleteHost,
  useEditHost,
  useRenameCluster,
} from "./mutations";

const STANDALONE = "__standalone__";

/** Small square icon-only button for the per-row actions in the tables. */
function IconBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="min-h-0 min-w-0 px-1.5 py-[2px]"
    >
      <Icon icon={icon} size={13} />
    </Button>
  );
}

// ---- Cluster Management ------------------------------------------------

export function ClusterManagementDialog() {
  const clusters = useQuery(clustersQuery());
  const create = useCreateCluster();
  const rename = useRenameCluster();
  const del = useDeleteCluster();

  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };
  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setDraft(name);
  };
  const saveEdit = () => {
    if (!editingId || !draft.trim()) return;
    rename.mutate(
      { id: editingId, name: draft.trim() },
      { onSuccess: cancelEdit },
    );
  };
  const addCluster = () => {
    if (!newName.trim()) return;
    create.mutate(newName.trim(), { onSuccess: () => setNewName("") });
  };
  const removeCluster = async (id: string, name: string) => {
    const ok = await confirm({
      title: "Delete Cluster",
      message: `Delete cluster "${name}"? Move or remove its member hosts first - an empty cluster only.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) del.mutate(id);
  };

  const list = clusters.data ?? [];

  return (
    <Dialog
      title="Cluster Management"
      onClose={organizeDialog.close}
      width={520}
      footer={<Button onClick={() => organizeDialog.close()}>Close</Button>}
    >
      <div className="flex flex-col gap-3">
        <Table wrapperClassName="max-h-[280px]">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="w-[64px] text-right">Hosts</Th>
              <Th className="w-[64px] text-right">VMs</Th>
              <Th className="w-[92px]"> </Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <Td colSpan={4} className="text-disabled-text">
                  {clusters.isLoading ? "Loading…" : "No clusters yet."}
                </Td>
              </tr>
            ) : (
              list.map((c) => {
                const editing = editingId === c.id;
                return (
                  <tr key={c.id} className="border-t border-surface-2">
                    <Td>
                      {editing ? (
                        <TextField
                          autoFocus
                          value={draft}
                          className="w-full"
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        c.name
                      )}
                    </Td>
                    <Td className="text-right">{c.hostCount}</Td>
                    <Td className="text-right">{c.vmCount}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {editing ? (
                          <>
                            <IconBtn
                              icon={Check}
                              label="Save"
                              onClick={saveEdit}
                              disabled={!draft.trim()}
                            />
                            <IconBtn
                              icon={X}
                              label="Cancel"
                              onClick={cancelEdit}
                            />
                          </>
                        ) : (
                          <>
                            <IconBtn
                              icon={Pencil}
                              label="Rename"
                              onClick={() => startEdit(c.id, c.name)}
                            />
                            <IconBtn
                              icon={Trash2}
                              label="Delete"
                              onClick={() => removeCluster(c.id, c.name)}
                              disabled={c.hostCount > 0}
                            />
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <div className="flex items-end gap-2 border-t border-bevel-dark pt-3">
          <TextField
            label="New cluster"
            value={newName}
            className="w-full"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCluster()}
          />
          <Button icon={Plus} onClick={addCluster} disabled={!newName.trim()}>
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---- Hosts Management ------------------------------------------------

interface HostDraft {
  name: string;
  fqdn: string;
  cluster: string;
}

const EMPTY_DRAFT: HostDraft = { name: "", fqdn: "", cluster: STANDALONE };

export function HostManagementDialog() {
  const hosts = useQuery(hostsQuery());
  const clusters = useQuery(clustersQuery());
  const create = useCreateHost();
  const edit = useEditHost();
  const del = useDeleteHost();

  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState<HostDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<HostDraft>(EMPTY_DRAFT);

  const clusterName = (id: string | null) =>
    id ? (clusters.data?.find((c) => c.id === id)?.name ?? id) : "(standalone)";

  const clusterOptions = [
    { value: STANDALONE, label: "(standalone)" },
    ...(clusters.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const toClusterId = (v: string) => (v === STANDALONE ? null : v);

  const cancelEdit = () => setEditingId(null);
  const startEdit = (h: Host) => {
    setEditingId(h.id);
    setDraft({
      name: h.name,
      fqdn: h.fqdn ?? "",
      cluster: h.clusterId ?? STANDALONE,
    });
  };
  const saveEdit = () => {
    if (!editingId || !draft.name.trim()) return;
    edit.mutate(
      {
        id: editingId,
        name: draft.name.trim(),
        fqdn: draft.fqdn.trim(),
        clusterId: toClusterId(draft.cluster),
      },
      { onSuccess: cancelEdit },
    );
  };
  const addHost = () => {
    if (!form.name.trim()) return;
    create.mutate(
      {
        name: form.name.trim(),
        clusterId: toClusterId(form.cluster),
      },
      {
        onSuccess: () => {
          setForm(EMPTY_DRAFT);
          setAdding(false);
        },
      },
    );
  };
  const removeHost = async (h: Host) => {
    const label = h.fqdn ? `${h.name} (${h.fqdn})` : h.name;
    const ok = await confirm({
      title: "Remove Host",
      message: `Remove "${label}" from Open vCenter? Its VM records, folders, templates and ISOs are deleted. The virtualization host itself is not touched.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) del.mutate(h.id);
  };

  const list = hosts.data ?? [];

  return (
    <Dialog
      title="Hosts Management"
      onClose={organizeDialog.close}
      width={560}
      footer={<Button onClick={() => organizeDialog.close()}>Close</Button>}
    >
      <div className="flex flex-col gap-3">
        <Table wrapperClassName="max-h-[280px]">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>FQDN</Th>
              <Th className="w-[128px]">Cluster</Th>
              <Th className="w-[76px]"> </Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <Td colSpan={4} className="text-disabled-text">
                  {hosts.isLoading ? "Loading…" : "No hosts yet."}
                </Td>
              </tr>
            ) : (
              list.map((h) => {
                const editing = editingId === h.id;
                return (
                  <tr key={h.id} className="border-t border-surface-2">
                    <Td>
                      {editing ? (
                        <TextField
                          autoFocus
                          value={draft.name}
                          className="w-full"
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, name: e.target.value }))
                          }
                        />
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`inline-block h-2 w-2 ${
                              h.online ? "bg-success" : "bg-bevel-dark"
                            }`}
                          />
                          {h.name}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {editing ? (
                        <TextField
                          value={draft.fqdn}
                          className="w-full"
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, fqdn: e.target.value }))
                          }
                        />
                      ) : (
                        <span className="text-disabled-text">
                          {h.fqdn ?? "-"}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {editing ? (
                        <Dropdown
                          value={draft.cluster}
                          className="w-full"
                          onChange={(v) =>
                            setDraft((d) => ({ ...d, cluster: v }))
                          }
                          options={clusterOptions}
                        />
                      ) : (
                        clusterName(h.clusterId)
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {editing ? (
                          <>
                            <IconBtn
                              icon={Check}
                              label="Save"
                              onClick={saveEdit}
                              disabled={!draft.name.trim()}
                            />
                            <IconBtn
                              icon={X}
                              label="Cancel"
                              onClick={cancelEdit}
                            />
                          </>
                        ) : (
                          <>
                            <IconBtn
                              icon={Pencil}
                              label="Edit"
                              onClick={() => startEdit(h)}
                            />
                            <IconBtn
                              icon={Trash2}
                              label="Remove"
                              onClick={() => removeHost(h)}
                            />
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        {editingId ? (
          <p className="text-disabled-text">
            Moving a host to another cluster removes its VMs from any folders.
          </p>
        ) : null}

        <div className="border-t border-bevel-dark pt-3">
          {adding ? (
            <div className="flex flex-col gap-2">
              <TextField
                label="Name"
                autoFocus
                className="w-full"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <Dropdown
                label="Cluster"
                value={form.cluster}
                onChange={(v) => setForm((f) => ({ ...f, cluster: v }))}
                options={clusterOptions}
              />
              <p className="text-disabled-text">
                The host's FQDN and IP are detected automatically once its agent
                connects.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  icon={Plus}
                  onClick={addHost}
                  disabled={!form.name.trim()}
                >
                  Add Host
                </Button>
                <Button onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button icon={Plus} onClick={() => setAdding(true)}>
              Add Host…
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
