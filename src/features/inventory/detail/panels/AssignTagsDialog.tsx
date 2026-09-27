import * as React from "react";
import { Button, Dialog, TextField } from "~/components/win95";
import type { Tag, Vm } from "~/api/types";
import { useAuth } from "~/auth";
import { organizeDialog } from "../../organize/dialogStore";
import { useSetVmTags } from "../../organize/mutations";
import { TagChip } from "../../organize/TagChip";
import { useTagCatalog } from "../../organize/tags";

/**
 * "Assign Tag…" from the VM Summary Tags box: tick the tags to add among the ones
 * the VM doesn't have yet. Ticking a tag unticks any other of its category (a VM
 * holds one tag per category), and one the VM already has in that category is
 * replaced on Assign. A single `PUT /vms/:id/tags` applies the lot.
 */
export function AssignTagsDialog({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const catalog = useTagCatalog();
  const setTags = useSetVmTags();
  const [filter, setFilter] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  const current = vm.tagIds ?? [];
  const available = catalog.tags.filter((t) => !current.includes(t.id));
  const needle = filter.trim().toLowerCase();
  const shown = available.filter(
    (t) => !needle || catalog.label(t).toLowerCase().includes(needle),
  );

  // group in catalog order: one section per category, then the standalone tags
  const sections: { key: string; title: string; note?: string; tags: Tag[] }[] = [];
  for (const c of catalog.categories) {
    const tags = shown.filter((t) => t.categoryId === c.id);
    if (!tags.length) continue;
    const had = catalog.tags.find((t) => t.categoryId === c.id && current.includes(t.id));
    sections.push({
      key: c.id,
      title: c.name,
      note: had ? `one per VM - replaces ${had.name}` : "one per VM",
      tags,
    });
  }
  const loose = shown.filter((t) => !t.categoryId);
  if (loose.length) sections.push({ key: "standalone", title: "Standalone tags", tags: loose });

  const toggle = (tag: Tag) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(tag.id)) {
        next.delete(tag.id);
      } else {
        // keep one pick per category
        for (const id of next) {
          if (tag.categoryId && catalog.tagsById.get(id)?.categoryId === tag.categoryId) {
            next.delete(id);
          }
        }
        next.add(tag.id);
      }
      return next;
    });

  const assign = () => {
    const adds = [...picked].map((id) => catalog.tagsById.get(id)).filter((t): t is Tag => !!t);
    if (!adds.length) return;
    const replacedCategories = new Set(adds.map((t) => t.categoryId).filter(Boolean));
    const kept = current.filter(
      (id) => !replacedCategories.has(catalog.tagsById.get(id)?.categoryId ?? null),
    );
    const names = adds.map((t) => catalog.label(t)).join(", ");
    setTags.mutate(
      {
        vmId: vm.id,
        tagIds: [...kept, ...adds.map((t) => t.id)],
        message: `Assigned ${names} to "${vm.name}"`,
      },
      { onSuccess: onClose },
    );
  };

  const manage = () => {
    onClose();
    organizeDialog.open({ kind: "tag-management" });
  };

  const empty =
    catalog.tags.length === 0
      ? isAdmin
        ? "No tags defined yet. Use Manage Tags… to create some."
        : "No tags defined yet. An administrator defines the available tags."
      : available.length === 0
        ? "Every tag is already assigned to this VM."
        : "No tags match the filter.";

  return (
    <Dialog
      title={`Assign Tags to "${vm.name}"`}
      onClose={onClose}
      width={460}
      footer={
        <>
          {isAdmin ? <Button onClick={manage}>Manage Tags…</Button> : null}
          <Button
            onClick={assign}
            disabled={picked.size === 0 || setTags.isPending}
            className="font-bold"
          >
            {picked.size > 1 ? `Assign (${picked.size})` : "Assign"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <TextField
          label="Filter"
          autoFocus
          value={filter}
          placeholder="Tag or category name"
          className="w-full"
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="bevel-sunken h-[280px] overflow-auto bg-window p-1">
          {catalog.isLoading ? (
            <p className="p-1 text-disabled-text">Loading…</p>
          ) : sections.length === 0 ? (
            <p className="p-1 text-disabled-text">{empty}</p>
          ) : (
            sections.map((s) => (
              <div key={s.key} className="mb-1.5">
                <div className="flex items-baseline gap-2 border-b border-line px-1 py-0.5">
                  <span className="font-bold">{s.title}</span>
                  {s.note ? <span className="text-disabled-text">({s.note})</span> : null}
                </div>
                {s.tags.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2 px-1 py-[3px] hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={picked.has(t.id)}
                      onChange={() => toggle(t)}
                    />
                    <TagChip tag={t} />
                    <span className="ml-auto text-disabled-text">
                      {t.vmCount} VM{t.vmCount === 1 ? "" : "s"}
                    </span>
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
