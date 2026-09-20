import { createRouter } from '@tanstack/react-router'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { ApiError } from '~/api/client'

// The backend rejects an expired/dead OIDC session with 401 on any API call.
// When that happens the app's own session cookie can still look valid, so the
// UI would otherwise sit there quietly broken - force a full logout instead.
let loggingOut = false

function handleApiError(error: unknown) {
  if (
    typeof window === 'undefined' ||
    loggingOut ||
    !(error instanceof ApiError) ||
    error.status !== 401
  ) {
    return
  }
  if (window.location.pathname === '/logout' || window.location.pathname === '/login') {
    return
  }
  loggingOut = true
  window.location.href = '/logout'
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5_000,
      },
    },
    queryCache: new QueryCache({ onError: handleApiError }),
    mutationCache: new MutationCache({ onError: handleApiError }),
  })

  return createRouter({
    routeTree,
    context: { queryClient, user: null, authDisabled: false },
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
