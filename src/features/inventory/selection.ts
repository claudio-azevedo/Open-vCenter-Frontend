import { getRouteApi } from '@tanstack/react-router'

export type SelectionKind =
  | 'cluster'
  | 'host'
  | 'folder'
  | 'vm'
  | 'templatefolder'
  | 'template'

export interface Selection {
  kind: SelectionKind
  id: string
}

export interface InventorySearch {
  /** "host:H7Kp2Qm9Rt" | "vm:<guid>" | "cluster:<id>" | "folder:<id>" */
  sel?: string
  /** active detail tab id */
  tab?: string
}

const KINDS: SelectionKind[] = [
  'cluster',
  'host',
  'folder',
  'vm',
  'templatefolder',
  'template',
]

export function parseSelection(sel: string | undefined): Selection | null {
  if (!sel) return null
  const [kind, ...rest] = sel.split(':')
  const id = rest.join(':')
  if (!id || !KINDS.includes(kind as SelectionKind)) return null
  return { kind: kind as SelectionKind, id }
}

export function encodeSelection(sel: Selection): string {
  return `${sel.kind}:${sel.id}`
}

export function validateInventorySearch(
  search: Record<string, unknown>,
): InventorySearch {
  const out: InventorySearch = {}
  if (typeof search.sel === 'string' && parseSelection(search.sel)) {
    out.sel = search.sel
  }
  if (typeof search.tab === 'string') out.tab = search.tab
  return out
}

const routeApi = getRouteApi('/_authed/inventory')

/** Read + update the current selection, backed by the URL. */
export function useInventorySelection() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const selection = parseSelection(search.sel)

  return {
    selection,
    tab: search.tab,
    select(next: Selection | null, tab?: string) {
      navigate({
        search: (prev) => ({
          ...prev,
          sel: next ? encodeSelection(next) : undefined,
          tab: tab ?? (next?.kind === selection?.kind ? prev.tab : undefined),
        }),
        replace: true,
      })
    },
    setTab(tab: string) {
      navigate({ search: (prev) => ({ ...prev, tab }), replace: true })
    },
  }
}
