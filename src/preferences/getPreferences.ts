import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { readCookie } from './cookies'
import { DEFAULT_THEME, THEME_COOKIE, isThemeId } from './theme'
import type { ThemeId } from './theme'
import {
  DEFAULT_TREE_BEHAVIOR,
  TREE_BEHAVIOR_COOKIE,
  isTreeBehavior,
} from './treeBehavior'
import type { TreeBehavior } from './treeBehavior'

export interface Preferences {
  theme: ThemeId
  treeBehavior: TreeBehavior
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: DEFAULT_THEME,
  treeBehavior: DEFAULT_TREE_BEHAVIOR,
}

export function parsePreferences(cookieHeader: string | undefined): Preferences {
  const theme = readCookie(cookieHeader, THEME_COOKIE)
  const treeBehavior = readCookie(cookieHeader, TREE_BEHAVIOR_COOKIE)
  return {
    theme: isThemeId(theme) ? theme : DEFAULT_THEME,
    treeBehavior: isTreeBehavior(treeBehavior)
      ? treeBehavior
      : DEFAULT_TREE_BEHAVIOR,
  }
}

/**
 * The persisted preferences. On the server they come from the request's
 * cookies (so SSR emits the right `data-theme`); in the browser from
 * `document.cookie` - no server round-trip on client-side navigation.
 */
export const getPreferences = createIsomorphicFn()
  .server(() =>
    parsePreferences(getRequest().headers.get('cookie') ?? undefined),
  )
  .client(() => parsePreferences(document.cookie))
