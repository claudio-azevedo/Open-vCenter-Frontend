/**
 * How the inventory tree opens on first load (and when the preference is
 * changed): `collapsed` shows only the top level, `expanded` opens every
 * cluster and host - folders always start collapsed.
 */
export const TREE_BEHAVIORS = [
  { id: 'collapsed', label: 'Collapsed' },
  { id: 'expanded', label: 'Expanded' },
] as const

export type TreeBehavior = (typeof TREE_BEHAVIORS)[number]['id']

export const DEFAULT_TREE_BEHAVIOR: TreeBehavior = 'collapsed'
export const TREE_BEHAVIOR_COOKIE = 'ovc-tree-behavior'

export function isTreeBehavior(value: unknown): value is TreeBehavior {
  return TREE_BEHAVIORS.some((b) => b.id === value)
}
