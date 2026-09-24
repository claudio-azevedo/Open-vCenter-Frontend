/**
 * Visual themes. A theme is purely CSS: `<html data-theme="…">` switches the
 * token set defined in `src/styles/themes/*.css`. Components never branch on
 * the theme id - the one exception is `ScrollArea`, which falls back to native
 * scrollbars for themes that set `nativeScrollbars`.
 */
export const THEMES = [
  { id: 'classic', label: 'Windows Classic', nativeScrollbars: false },
  { id: 'xp', label: 'Windows XP', nativeScrollbars: false },
  { id: 'win7', label: 'Windows 7', nativeScrollbars: false },
  { id: 'modern-light', label: 'Modern (Light)', nativeScrollbars: true },
  { id: 'modern-dark', label: 'Modern (Dark)', nativeScrollbars: true },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type ThemeDef = (typeof THEMES)[number]

export const DEFAULT_THEME: ThemeId = 'classic'
export const THEME_COOKIE = 'ovc-theme'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

export function themeDef(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
