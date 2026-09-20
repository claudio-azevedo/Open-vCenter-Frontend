import * as React from 'react'

/**
 * Renders children only after the component has mounted on the client.
 * Used to keep DOM-touching libraries (ag-grid) out of the SSR pass.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return <>{mounted ? children : fallback}</>
}
