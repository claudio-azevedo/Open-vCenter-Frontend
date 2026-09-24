import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Dialog, Icon, Table, Td, TextField, Th } from "~/components/win95";
import { vlansQuery } from "~/api/queries";
import type { Vlan } from "~/api/types";
import { confirm } from "../../confirm";
import {
  useCreateVlan,
  useDeleteVlan,
  useUpdateVlan,
} from "../../organize/mutations";

/**
 * VLAN registry ("Virtual Networks") for a cluster or a standalone host - the
 * tags offered when creating / editing a VM NIC. A host that belongs to a
 * cluster manages the cluster's list (pass `clusterId`), like the cluster view.
 */
export function VirtualNetworksPanel(
  scope: { clusterId: string; hostId?: never } | { hostId: string; clusterId?: never },
) {
  const vlans = useQuery(vlansQuery(scope));
  const del = useDeleteVlan();
  const [editing, setEditing] = React.useState<Vlan | "new" | null>(null);

  const remove = async (v: Vlan) => {
    if (
      await confirm({
        title: "Delete VLAN",
        message: `Delete VLAN "${v.name}" (tag ${v.vlanId})? VMs already tagged with it are not changed.`,
        confirmLabel: "Delete",
        danger: true,
      })
    ) {
      del.mutate(v.id);
    }
  };

  const list = vlans.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-disabled-text">
          {scope.clusterId
            ? "VLANs available to every host in this cluster."
            : "VLANs available on this host."}
        </p>
        <Button className="min-w-0 px-2" onClick={() => setEditing("new")}>
          <Icon icon={Plus} size={14} />
          Add VLAN…
        </Button>
      </div>
      {vlans.isLoading ? (
        <p className="text-disabled-text">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-disabled-text">No VLANs registered yet.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>VLAN ID</Th>
              <Th>Description</Th>
              <Th>Default</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id}>
                <Td>{v.name}</Td>
                <Td>{v.vlanId}</Td>
                <Td>{v.description || "-"}</Td>
                <Td>{v.isDefault ? "Yes" : ""}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button
                      className="min-w-0 px-1.5"
                      title="Edit"
                      onClick={() => setEditing(v)}
                    >
                      <Icon icon={Pencil} size={13} />
                    </Button>
                    <Button
                      className="min-w-0 px-1.5"
                      title="Delete"
                      disabled={del.isPending}
                      onClick={() => remove(v)}
                    >
                      <Icon icon={Trash2} size={13} />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing ? (
        <VlanDialog
          scope={scope}
          vlan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function VlanDialog({
  scope,
  vlan,
  onClose,
}: {
  scope: { clusterId?: string; hostId?: string };
  vlan: Vlan | null;
  onClose: () => void;
}) {
  const create = useCreateVlan();
  const update = useUpdateVlan();
  const [name, setName] = React.useState(vlan?.name ?? "");
  const [tag, setTag] = React.useState(vlan ? String(vlan.vlanId) : "");
  const [description, setDescription] = React.useState(vlan?.description ?? "");
  const [isDefault, setIsDefault] = React.useState(vlan?.isDefault ?? false);

  const tagNum = Number(tag);
  const valid =
    name.trim().length > 0 && Number.isInteger(tagNum) && tagNum >= 1 && tagNum <= 4094;
  const pending = create.isPending || update.isPending;

  const submit = () => {
    if (!valid) return;
    const common = {
      name: name.trim(),
      description: description.trim() || undefined,
      isDefault,
    };
    if (vlan) {
      update.mutate({ id: vlan.id, ...common }, { onSuccess: onClose });
    } else {
      create.mutate(
        scope.clusterId
          ? { ...common, vlanId: tagNum, clusterId: scope.clusterId }
          : { ...common, vlanId: tagNum, hostId: scope.hostId },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Dialog
      title={vlan ? `Edit VLAN - "${vlan.name}"` : "Add VLAN"}
      onClose={onClose}
      width={380}
      footer={
        <>
          <Button disabled={!valid || pending} onClick={submit}>
            {vlan ? "Save" : "Add"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <TextField
          label="Name"
          value={name}
          maxLength={255}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="VLAN ID (1-4094)"
          value={tag}
          disabled={!!vlan}
          title={vlan ? "The tag cannot be changed - delete and re-add the VLAN" : undefined}
          onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-32"
        />
        <TextField
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex items-center gap-2 text-base">
          <input
            type="checkbox"
            className="h-3.5 w-3.5"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Default VLAN for new VMs
        </label>
      </div>
    </Dialog>
  );
}
