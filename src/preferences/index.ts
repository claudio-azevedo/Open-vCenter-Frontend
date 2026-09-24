export { THEMES, DEFAULT_THEME, THEME_COOKIE, isThemeId, themeDef } from './theme'
export type { ThemeId, ThemeDef } from './theme'
export {
  TREE_BEHAVIORS,
  DEFAULT_TREE_BEHAVIOR,
  TREE_BEHAVIOR_COOKIE,
  isTreeBehavior,
} from './treeBehavior'
export type { TreeBehavior } from './treeBehavior'
export { DEFAULT_PREFERENCES, getPreferences } from './getPreferences'
export type { Preferences } from './getPreferences'
export { PreferencesProvider, useTheme, useTreeBehavior } from './provider'
