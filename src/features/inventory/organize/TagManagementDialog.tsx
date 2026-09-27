import * as React from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Button,
  Dialog,
  Dropdown,
  GroupBox,
  Table,
  Td,
  TextField,
  Th,
} from "~/components/win95";
import type { Tag, TagCategory, TagColor } from "~/api/types";
import { ApiError } from "~/api/client";
import { confirm } from "../confirm";
import { organizeDialog } from "./dialogStore";
import { IconBtn } from "./ManagementDialogs";
import {
  useCreateTag,
  useCreateTagCategory,
  useDeleteTag,
  useDeleteTagCategory,
  useRenameTagCategory,
  useUpdateTag,
} from "./mutations";
import { TAG_NAME_HINT, tagNameOk, useTagCatalog } from "./tags";
import { TagChip, TagColorDropdown } from "./TagChip";

const ALL = "__all__";
const STANDALONE = "__standalone__";

const toCategoryId = (v: string) => (v === STANDALONE || v === ALL ? null : v);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** File ▸ Tag Management… (admin only). Categories and tags are a global
 *  catalog; the backend rejects every write here from a non-admin. */
export function TagManagementDialog() {
  const catalog = useTagCatalog();
  const [error, setError] = React.useState<string | null>(null);
  // shared mutate callbacks: surface the backend's message inside the dialog
  const report = {
    onSuccess: () => setError(null),
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : String(e)),
  };

  return (
    <Dialog
      title="Tag Management"
      onClose={organizeDialog.close}
      width={700}
      footer={<Button onClick={() => organizeDialog.close()}>Close</Button>}
    >
      <div className="flex flex-col gap-3">
        <CategoriesBox catalog={catalog} report={report} />
        <TagsBox catalog={catalog} report={report} />
        {error ? <p className="text-danger">{error}</p> : null}
        <p className="text-disabled-text">
          Names: {TAG_NAME_HINT} A VM holds at most one tag of each category.
        </p>
      </div>
    </Dialog>
  );
}

type Catalog = ReturnType<typeof useTagCatalog>;
interface Report {
  onSuccess: () => void;
  onError: (e: unknown) => void;
}

// ---- Categories --------------------------------------------------------------

function CategoriesBox({
  catalog,
  report,
}: {
  catalog: Catalog;
  report: Report;
}) {
  const create = useCreateTagCategory();
  const rename = useRenameTagCategory();
  const del = useDeleteTagCategory();

  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const tagsOf = (id: string) => catalog.tags.filter((t) => t.categoryId === id);

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };
  const saveEdit = () => {
    if (!editingId || !draft.trim() || !tagNameOk(draft)) return;
    rename.mutate(
      { id: editingId, name: draft.trim() },
      {
        ...report,
        onSuccess: () => {
          report.onSuccess();
          cancelEdit();
        },
      },
    );
  };
  const addCategory = () => {
    if (!newName.trim() || !tagNameOk(newName)) return;
    create.mutate(newName.trim(), {
      ...report,
      onSuccess: () => {
        report.onSuccess();
        setNewName("");
      },
    });
  };
  const removeCategory = async (c: TagCategory) => {
    const tags = tagsOf(c.id);
    // one tag per category per VM, so the sum counts distinct VMs
    const vms = tags.reduce((n, t) => n + t.vmCount, 0);
    const ok = await confirm({
      title: "Delete Tag Category",
      message: tags.length
        ? `Delete category "${c.name}" and its ${plural(tags.length, "tag")}? ` +
          `They are removed from ${plural(vms, "VM")}; the VMs themselves are not changed.`
        : `Delete category "${c.name}"? It has no tags.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) del.mutate({ id: c.id, name: c.name }, report);
  };

  return (
    <GroupBox label="Categories">
      <div className="flex flex-col gap-2">
        <Table wrapperClassName="max-h-[150px]">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="w-[64px] text-right">Tags</Th>
              <Th className="w-[64px] text-right">VMs</Th>
              <Th className="w-[76px]"> </Th>
            </tr>
          </thead>
          <tbody>
            {catalog.categories.length === 0 ? (
              <tr>
                <Td colSpan={4} className="text-disabled-text">
                  {catalog.isLoading ? "Loading…" : "No categories yet."}
                </Td>
              </tr>
            ) : (
              catalog.categories.map((c) => {
                const editing = editingId === c.id;
                const tags = tagsOf(c.id);
                return (
                  <tr key={c.id} className="border-t border-surface-2">
                    <Td>
                      {editing ? (
                        <TextField
                          autoFocus
                          value={draft}
                          className="w-full"
                          aria-invalid={!tagNameOk(draft)}
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
                    <Td className="text-right">{tags.length}</Td>
                    <Td className="text-right">
                      {tags.reduce((n, t) => n + t.vmCount, 0)}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {editing ? (
                          <>
                            <IconBtn
                              icon={Check}
                              label="Save"
                              onClick={saveEdit}
                              disabled={!draft.trim() || !tagNameOk(draft)}
                            />
                            <IconBtn icon={X} label="Cancel" onClick={cancelEdit} />
                          </>
                        ) : (
                          <>
                            <IconBtn
                              icon={Pencil}
                              label="Rename"
                              onClick={() => {
                                setEditingId(c.id);
                                setDraft(c.name);
                              }}
                            />
                            <IconBtn
                              icon={Trash2}
                              label="Delete"
                              onClick={() => removeCategory(c)}
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

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="New category"
              value={newName}
              className="w-full"
              maxLength={64}
              aria-invalid={!tagNameOk(newName)}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
          </div>
          <Button
            icon={Plus}
            onClick={addCategory}
            disabled={!newName.trim() || !tagNameOk(newName) || create.isPending}
          >
            Create
          </Button>
        </div>
        {!tagNameOk(newName) ? <p className="text-danger">{TAG_NAME_HINT}</p> : null}
      </div>
    </GroupBox>
  );
}

// ---- Tags --------------------------------------------------------------------

interface TagDraft {
  name: string;
  category: string;
  color: TagColor;
}

const NEW_TAG: TagDraft = { name: "", category: STANDALONE, color: "blue" };

function TagsBox({ catalog, report }: { catalog: Catalog; report: Report }) {
  const create = useCreateTag();
  const update = useUpdateTag();
  const del = useDeleteTag();

  const [filter, setFilter] = React.useState(ALL);
  const [form, setForm] = React.useState<TagDraft>(NEW_TAG);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<TagDraft>(NEW_TAG);

  // a category deleted meanwhile falls back to "all" / "standalone"
  const known = (v: string) =>
    v === ALL || v === STANDALONE || catalog.categoriesById.has(v);
  const shown = known(filter) ? filter : ALL;
  const formCategory = known(form.category) ? form.category : STANDALONE;

  const categoryOptions = [
    { value: STANDALONE, label: "(none - standalone)" },
    ...catalog.categories.map((c) => ({ value: c.id, label: c.name })),
  ];
  const filterOptions = [
    { value: ALL, label: "All tags" },
    { value: STANDALONE, label: "Standalone tags" },
    ...catalog.categories.map((c) => ({ value: c.id, label: `Category: ${c.name}` })),
  ];

  const list = catalog.tags.filter((t) =>
    shown === ALL ? true : t.categoryId === toCategoryId(shown),
  );

  const pickFilter = (v: string) => {
    setFilter(v);
    // new tags default to the category being looked at
    if (v !== ALL) setForm((f) => ({ ...f, category: v }));
  };

  const cancelEdit = () => setEditingId(null);
  const startEdit = (t: Tag) => {
    setEditingId(t.id);
    setDraft({ name: t.name, category: t.categoryId ?? STANDALONE, color: t.color });
  };
  const saveEdit = () => {
    if (!editingId || !draft.name.trim() || !tagNameOk(draft.name)) return;
    update.mutate(
      {
        id: editingId,
        name: draft.name.trim(),
        categoryId: toCategoryId(draft.category),
        color: draft.color,
      },
      {
        ...report,
        onSuccess: () => {
          report.onSuccess();
          cancelEdit();
        },
      },
    );
  };
  const addTag = () => {
    if (!form.name.trim() || !tagNameOk(form.name)) return;
    create.mutate(
      {
        name: form.name.trim(),
        categoryId: toCategoryId(formCategory),
        color: form.color,
      },
      {
        ...report,
        onSuccess: () => {
          report.onSuccess();
          setForm((f) => ({ ...f, name: "" }));
        },
      },
    );
  };
  const removeTag = async (t: Tag) => {
    const label = catalog.label(t);
    const ok = await confirm({
      title: "Delete Tag",
      message: t.vmCount
        ? `Delete tag "${label}"? It is removed from ${plural(t.vmCount, "VM")}; ` +
          `the VMs themselves are not changed.`
        : `Delete tag "${label}"? No VM carries it.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) del.mutate({ id: t.id, label }, report);
  };

  return (
    <GroupBox label="Tags">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span>Show</span>
          <Dropdown
            value={shown}
            onChange={pickFilter}
            options={filterOptions}
            className="w-[240px]"
          />
        </div>
        <Table wrapperClassName="max-h-[200px]">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="w-[170px]">Category</Th>
              <Th className="w-[56px] text-right">VMs</Th>
              <Th className="w-[76px]"> </Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <Td colSpan={4} className="text-disabled-text">
                  {catalog.isLoading ? "Loading…" : "No tags here yet."}
                </Td>
              </tr>
            ) : (
              list.map((t) => {
                const editing = editingId === t.id;
                return (
                  <tr key={t.id} className="border-t border-surface-2">
                    <Td>
                      {editing ? (
                        <div className="flex gap-1">
                          <TextField
                            autoFocus
                            value={draft.name}
                            className="w-full min-w-0"
                            aria-invalid={!tagNameOk(draft.name)}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, name: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <TagColorDropdown
                            value={draft.color}
                            onChange={(color) => setDraft((d) => ({ ...d, color }))}
                            className="w-[104px] shrink-0"
                          />
                        </div>
                      ) : (
                        <TagChip tag={t} />
                      )}
                    </Td>
                    <Td>
                      {editing ? (
                        <Dropdown
                          value={draft.category}
                          className="w-full"
                          onChange={(v) => setDraft((d) => ({ ...d, category: v }))}
                          options={categoryOptions}
                        />
                      ) : t.categoryId ? (
                        (catalog.categoriesById.get(t.categoryId)?.name ?? "-")
                      ) : (
                        <span className="text-disabled-text">(standalone)</span>
                      )}
                    </Td>
                    <Td className="text-right">{t.vmCount}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {editing ? (
                          <>
                            <IconBtn
                              icon={Check}
                              label="Save"
                              onClick={saveEdit}
                              disabled={!draft.name.trim() || !tagNameOk(draft.name)}
                            />
                            <IconBtn icon={X} label="Cancel" onClick={cancelEdit} />
                          </>
                        ) : (
                          <>
                            <IconBtn
                              icon={Pencil}
                              label="Edit"
                              onClick={() => startEdit(t)}
                            />
                            <IconBtn
                              icon={Trash2}
                              label="Delete"
                              onClick={() => removeTag(t)}
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

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="New tag"
              value={form.name}
              className="w-full"
              maxLength={64}
              aria-invalid={!tagNameOk(form.name)}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
            />
          </div>
          <Dropdown
            label="Category"
            value={formCategory}
            onChange={(v) => setForm((f) => ({ ...f, category: v }))}
            options={categoryOptions}
            className="w-[170px]"
          />
          <TagColorDropdown
            label="Color"
            value={form.color}
            onChange={(color) => setForm((f) => ({ ...f, color }))}
            className="w-[104px]"
          />
          <Button
            icon={Plus}
            onClick={addTag}
            disabled={!form.name.trim() || !tagNameOk(form.name) || create.isPending}
          >
            Create
          </Button>
        </div>
        {!tagNameOk(form.name) ? <p className="text-danger">{TAG_NAME_HINT}</p> : null}
      </div>
    </GroupBox>
  );
}
