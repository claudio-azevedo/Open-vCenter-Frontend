import { createFileRoute, redirect } from '@tanstack/react-router'
import { Login } from '~/components/Login'

export const Route = createFileRoute('/login')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; error?: string } => {
    const out: { redirect?: string; error?: string } = {}
    if (typeof search.redirect === 'string') out.redirect = search.redirect
    if (typeof search.error === 'string') out.error = search.error
    return out
  },
  beforeLoad: ({ context, search }) => {
    if (context.user) {
      throw redirect({ to: search.redirect || '/inventory' })
    }
  },
  component: LoginComp,
})

function LoginComp() {
  const { redirect: redirectTo, error } = Route.useSearch()
  return <Login redirectTo={redirectTo} error={error} />
}
