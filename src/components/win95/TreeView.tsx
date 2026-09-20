import * as React from "react";
import { cn } from "./bevel";

export interface TreeNode {
  id: string;
  label: React.ReactNode;
  /** Rendered before the label - typically an <Icon> or a small status dot. */
  icon?: React.ReactNode;
  children?: TreeNode[];
  /** When true, show an expander even with no children loaded yet. */
  hasChildren?: boolean;
}

export interface TreeViewProps {
  nodes: TreeNode[];
  selectedId?: string;
  expandedIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  className?: string;
}

function Expander({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={expanded ? "Collapse" : "Expand"}
      onClick={onClick}
      className="grid h-[15px] w-[15px] shrink-0 place-items-center border border-bevel-dark bg-window text-[11px] leading-none text-black"
    >
      {expanded ? "−" : "+"}
    </button>
  );
}

function TreeRow({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
} & Omit<TreeViewProps, "nodes" | "className">) {
  const expandable = !!node.children?.length || !!node.hasChildren;
  const expanded = expandedIds.has(node.id);
  const selected = selectedId === node.id;

  return (
    <li>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={expandable ? expanded : undefined}
        onClick={() => onSelect(node.id)}
        onDoubleClick={() => expandable && onToggle(node.id)}
        className={cn(
          "flex h-[18px] cursor-default items-center gap-1 pr-2 whitespace-nowrap",
          selected && "bg-selection text-selection-text",
        )}
        style={{ paddingLeft: depth * 16 + 2 }}
      >
        {expandable ? (
          <Expander
            expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          />
        ) : (
          <span className="w-[15px] shrink-0" />
        )}
        {node.icon ? (
          <span className="grid shrink-0 place-items-center">{node.icon}</span>
        ) : null}
        <span className="truncate">{node.label}</span>
      </div>
      {expandable && expanded && node.children?.length ? (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TreeView({
  nodes,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  className,
}: TreeViewProps) {
  return (
    <ul
      role="tree"
      className={cn(
        "bevel-sunken h-full overflow-auto bg-window py-1",
        className,
      )}
    >
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}
