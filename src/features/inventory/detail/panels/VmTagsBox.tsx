import * as React from "react";
import { Tag as TagIcon } from "lucide-react";
import { Button, GroupBox } from "~/components/win95";
import type { Vm } from "~/api/types";
import { useSetVmTags } from "../../organize/mutations";
import { TagChip } from "../../organize/TagChip";
import { useTagCatalog } from "../../organize/tags";
import { AssignTagsDialog } from "./AssignTagsDialog";

/**
 * The VM's tags (Summary tab, beside Notes): coloured chips with a remove ×, and
 * "Assign Tag…" to add more. Any user who can see the VM tags it; a DB-only
 * change, so it stays enabled while the VM is locked or its host is offline.
 */
export function VmTagsBox({ vm, className }: { vm: Vm; className?: string }) {
  const catalog = useTagCatalog();
  const setTags = useSetVmTags();
  const [assigning, setAssigning] = React.useState(false);

  // `?? []`: a backend that predates tags omits the field
  const tagIds = vm.tagIds ?? [];
  // catalog order: categorized tags (by category), then standalone ones
  const assigned = catalog.tags.filter((t) => tagIds.includes(t.id));

  return (
    <GroupBox label="Tags" className={className}>
      <div className="flex flex-1 flex-col gap-2">
        <div className="ui-field flex min-h-[52px] flex-1 flex-wrap content-start gap-1 overflow-auto p-1">
          {assigned.length === 0 ? (
            <span className="px-0.5 text-disabled-text">
              {catalog.isLoading ? "Loading…" : "No tags assigned"}
            </span>
          ) : (
            assigned.map((t) => (
              <TagChip
                key={t.id}
                tag={t}
                category={
                  t.categoryId ? catalog.categoriesById.get(t.categoryId)?.name : null
                }
                removeDisabled={setTags.isPending}
                onRemove={() =>
                  setTags.mutate({
                    vmId: vm.id,
                    tagIds: tagIds.filter((id) => id !== t.id),
                    message: `Removed tag "${catalog.label(t)}" from "${vm.name}"`,
                  })
                }
              />
            ))
          )}
        </div>
        <div className="flex justify-end">
          <Button
            icon={TagIcon}
            className="min-w-0 px-2"
            onClick={() => setAssigning(true)}
          >
            Assign Tag…
          </Button>
        </div>
      </div>
      {assigning ? <AssignTagsDialog vm={vm} onClose={() => setAssigning(false)} /> : null}
    </GroupBox>
  );
}
