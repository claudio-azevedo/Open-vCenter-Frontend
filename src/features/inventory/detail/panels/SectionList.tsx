import type { ReactNode } from "react";
import { cn } from "~/components/win95";

export interface Section {
  id: string;
  label: string;
}

/**
 * A list-box of sections on the left, the selected section's content on the
 * right - the vertical-tab layout of the host / cluster "Configuration" tab.
 */
export function SectionList({
  sections,
  value,
  onChange,
  children,
}: {
  sections: Section[];
  value: string;
  onChange: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 gap-3">
      <ul
        role="listbox"
        className="ui-field w-52 shrink-0 self-start bg-window p-0.5 text-base"
      >
        {sections.map((s) => (
          <li
            key={s.id}
            role="option"
            aria-selected={s.id === value}
            onClick={() => onChange(s.id)}
            className={cn(
              "cursor-default select-none px-2 py-0.5",
              s.id === value && "bg-selection text-selection-text",
            )}
          >
            {s.label}
          </li>
        ))}
      </ul>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
