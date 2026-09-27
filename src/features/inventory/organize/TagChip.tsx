import { Tag as TagIcon, X } from "lucide-react";
import { Dropdown, Icon, cn } from "~/components/win95";
import { TAG_COLORS } from "~/api/types";
import type { Tag, TagColor } from "~/api/types";

// Full class strings (not built from the colour name) so Tailwind emits them.
const CHIP_CLASS: Record<TagColor, string> = {
  gray: "bg-tag-gray text-tag-gray-fg",
  red: "bg-tag-red text-tag-red-fg",
  orange: "bg-tag-orange text-tag-orange-fg",
  yellow: "bg-tag-yellow text-tag-yellow-fg",
  green: "bg-tag-green text-tag-green-fg",
  teal: "bg-tag-teal text-tag-teal-fg",
  blue: "bg-tag-blue text-tag-blue-fg",
  navy: "bg-tag-navy text-tag-navy-fg",
  purple: "bg-tag-purple text-tag-purple-fg",
  pink: "bg-tag-pink text-tag-pink-fg",
};

const SWATCH_CLASS: Record<TagColor, string> = {
  gray: "bg-tag-gray",
  red: "bg-tag-red",
  orange: "bg-tag-orange",
  yellow: "bg-tag-yellow",
  green: "bg-tag-green",
  teal: "bg-tag-teal",
  blue: "bg-tag-blue",
  navy: "bg-tag-navy",
  purple: "bg-tag-purple",
  pink: "bg-tag-pink",
};

const colorLabel = (c: TagColor) => c[0].toUpperCase() + c.slice(1);

/** A coloured tag label: `[🏷 Category: Name ×]`. `onRemove` adds the × button. */
export function TagChip({
  tag,
  category,
  onRemove,
  removeDisabled,
  className,
}: {
  tag: Pick<Tag, "name" | "color">;
  /** the category name, shown muted before the tag name */
  category?: string | null;
  onRemove?: () => void;
  removeDisabled?: boolean;
  className?: string;
}) {
  const label = category ? `${category}: ${tag.name}` : tag.name;
  return (
    <span
      title={label}
      className={cn(
        "bevel-thin-raised inline-flex h-fit max-w-full items-center gap-1 rounded-sm py-[1px] pl-1.5",
        onRemove ? "pr-0.5" : "pr-1.5",
        CHIP_CLASS[tag.color] ?? CHIP_CLASS.gray,
        className,
      )}
    >
      <Icon icon={TagIcon} size={12} />
      {category ? <span className="opacity-80">{category}:</span> : null}
      <span className="truncate font-semibold">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          title={`Remove tag ${label}`}
          aria-label={`Remove tag ${label}`}
          disabled={removeDisabled}
          onClick={onRemove}
          className="grid h-4 w-4 shrink-0 place-items-center opacity-75 hover:opacity-100 disabled:opacity-40"
        >
          <Icon icon={X} size={12} />
        </button>
      ) : null}
    </span>
  );
}

/** A small filled square in a tag colour. */
export function ColorSwatch({ color }: { color: TagColor }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3 w-3 shrink-0 border border-bevel-darker", SWATCH_CLASS[color])}
    />
  );
}

/** Dropdown over the tag colour palette, each option with its swatch. */
export function TagColorDropdown({
  value,
  onChange,
  label,
  className,
}: {
  value: TagColor;
  onChange: (color: TagColor) => void;
  label?: string;
  className?: string;
}) {
  return (
    <Dropdown
      label={label}
      value={value}
      onChange={(v) => onChange(v as TagColor)}
      className={className}
      options={TAG_COLORS.map((c) => ({
        value: c,
        label: (
          <span className="inline-flex items-center gap-1.5">
            <ColorSwatch color={c} />
            {colorLabel(c)}
          </span>
        ),
      }))}
    />
  );
}
