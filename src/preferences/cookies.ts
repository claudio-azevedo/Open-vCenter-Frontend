/**
 * User preferences live in plain cookies (not localStorage) so the server can
 * read them during SSR - e.g. render `<html data-theme>` on the first byte,
 * with no flash of the default before hydration. They are UI preferences
 * only, never anything sensitive.
 */
const ONE_YEAR = 60 * 60 * 24 * 365

/** Reads one cookie from a `document.cookie`-style header string. */
export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  const match = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined
}

export function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`
}
