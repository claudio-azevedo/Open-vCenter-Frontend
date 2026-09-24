import * as React from 'react'
import { writeCookie } from './cookies'
import { THEME_COOKIE, themeDef } from './theme'
import type { ThemeDef, ThemeId } from './theme'
import { TREE_BEHAVIOR_COOKIE } from './treeBehavior'
import type { TreeBehavior } from './treeBehavior'
import type { Preferences } from './getPreferences'

interface PreferencesContextValue extends Preferences {
  setTheme: (id: ThemeId) => void
  setTreeBehavior: (behavior: TreeBehavior) => void
}

const PreferencesContext = React.createContext<PreferencesContextValue | null>(
  null,
)

export function PreferencesProvider({
  initial,
  children,
}: {
  initial: Preferences
  children: React.ReactNode
}) {
  const [prefs, setPrefs] = React.useState(initial)

  const setTheme = React.useCallback((id: ThemeId) => {
    writeCookie(THEME_COOKIE, id)
    // <html data-theme> is rendered from this state by RootDocument; setting it
    // here too makes the switch land in the same frame as the state update.
    document.documentElement.dataset.theme = id
    setPrefs((p) => ({ ...p, theme: id }))
  }, [])

  const setTreeBehavior = React.useCallback((behavior: TreeBehavior) => {
    writeCookie(TREE_BEHAVIOR_COOKIE, behavior)
    setPrefs((p) => ({ ...p, treeBehavior: behavior }))
  }, [])

  const value = React.useMemo(
    () => ({ ...prefs, setTheme, setTreeBehavior }),
    [prefs, setTheme, setTreeBehavior],
  )
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

function usePreferences(): PreferencesContextValue {
  const ctx = React.useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>')
  return ctx
}

export function useTheme(): {
  theme: ThemeId
  def: ThemeDef
  setTheme: (id: ThemeId) => void
} {
  const { theme, setTheme } = usePreferences()
  return { theme, def: themeDef(theme), setTheme }
}

export function useTreeBehavior(): {
  treeBehavior: TreeBehavior
  setTreeBehavior: (behavior: TreeBehavior) => void
} {
  const { treeBehavior, setTreeBehavior } = usePreferences()
  return { treeBehavior, setTreeBehavior }
}
