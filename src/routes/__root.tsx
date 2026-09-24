/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { AuthProvider, fetchCurrentUser } from '~/auth'
import type { AuthUser } from '~/auth'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'
import {
  DEFAULT_PREFERENCES,
  PreferencesProvider,
  getPreferences,
  useTheme,
} from '~/preferences'
import type { Preferences } from '~/preferences'

export interface RouterContext {
  queryClient: QueryClient
  user: AuthUser | null
  authDisabled: boolean
  preferences: Preferences
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const { user, authDisabled } = await fetchCurrentUser()
    return { user, authDisabled, preferences: getPreferences() }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo({
        title: 'Open vCenter',
        description: 'Manage virtualization hosts and virtual machines.',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  errorComponent: (props) => (
    // beforeLoad may be what failed, so the context can't be trusted here.
    <PreferencesProvider initial={DEFAULT_PREFERENCES}>
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    </PreferencesProvider>
  ),
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  const { user, authDisabled, queryClient, preferences } =
    Route.useRouteContext()
  return (
    <PreferencesProvider initial={preferences}>
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <AuthProvider user={user} authDisabled={authDisabled}>
          <Outlet />
        </AuthProvider>
        {import.meta.env.DEV ? (
          <>
            <TanStackRouterDevtools position="bottom-right" />
            <ReactQueryDevtools buttonPosition="bottom-left" />
          </>
        ) : null}
      </QueryClientProvider>
    </RootDocument>
    </PreferencesProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="ovc-root" className="h-screen w-screen overflow-hidden">
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  )
}
