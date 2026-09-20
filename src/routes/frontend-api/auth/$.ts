import { createFileRoute } from '@tanstack/react-router'
import { auth } from '~/auth/auth'

/**
 * better-auth OAuth endpoints (sign-in redirect, OIDC provider callback, sign-out).
 * Lives under /frontend-api/* so a reverse proxy can route /api/* to ovc-backend
 * and everything else here without a path clash (see README).
 *
 * On a failed callback we wipe the better-auth cookies so a stale/expired
 * session can't wedge the next login attempt.
 */
const CLEAR_COOKIES = [
  'better-auth.session_token',
  'better-auth.session_data',
  'better-auth.oauth_state',
  'better-auth.pkce_code_verifier',
  'better-auth.state',
]

function clearCookieHeaders(): Headers {
  const headers = new Headers()
  for (const name of CLEAR_COOKIES) {
    headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
    headers.append(
      'Set-Cookie',
      `__Secure-${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    )
  }
  return headers
}

export const Route = createFileRoute('/frontend-api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let response: Response
        try {
          response = await auth.handler(request)
        } catch {
          const headers = clearCookieHeaders()
          headers.set('Location', '/login?error=session_expired')
          return new Response(null, { status: 302, headers })
        }

        const url = new URL(request.url)
        if (
          url.searchParams.get('error') ||
          response.headers.get('location')?.includes('error')
        ) {
          const headers = clearCookieHeaders()
          for (const [k, v] of response.headers) {
            if (k.toLowerCase() === 'set-cookie') headers.append('Set-Cookie', v)
          }
          headers.set('Location', '/login?error=auth_failed')
          return new Response(null, { status: 302, headers })
        }

        return response
      },
      POST: ({ request }) => auth.handler(request),
    },
  },
})
