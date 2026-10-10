/**
 * Visual themes. A theme is purely CSS: `<html data-theme="…">` switches the
 * token set defined in `src/styles/themes/*.css`. Components never branch on
 * the theme id - the one exception is `ScrollArea`, which falls back to native
 * scrollbars for themes that set `nativeScrollbars`.
 *
 * Keep the list sorted by label: the login dropdown and Preferences ▸ Theme
 * show it in this order.
 */
export const THEMES = [
  { id: '16bit', label: '16bit Overload', nativeScrollbars: false },
  { id: 'mac-classic', label: 'Classic MacOS', nativeScrollbars: false },
  { id: 'modern-dark', label: 'Modern (Dark)', nativeScrollbars: true },
  { id: 'modern-light', label: 'Modern (Light)', nativeScrollbars: true },
  { id: 'vmware', label: 'VMware Nostalgia', nativeScrollbars: true },
  { id: 'win7', label: 'Windows 7', nativeScrollbars: false },
  { id: 'classic', label: 'Windows Classic', nativeScrollbars: false },
  { id: 'xp', label: 'Windows XP', nativeScrollbars: false },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type ThemeDef = (typeof THEMES)[number]

export const DEFAULT_THEME: ThemeId = 'win7'
export const THEME_COOKIE = 'ovc-theme'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

export function themeDef(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!
}
