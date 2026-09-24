import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button, Dialog, Icon } from '~/components/win95'
import { useAuth } from './useAuth'

/**
 * Shown once per page load whenever `OVC_AUTH_MODE=stub` is active - see
 * `bypass.ts`. Dismissible (it's informational, not a gate), but comes back
 * on the next full page load so a no-auth deployment can't go unnoticed.
 *
 * Reads the stand-in user from auth context rather than importing `bypass.ts`
 * directly - that module is server-only and must never reach the client bundle.
 */
export function DevBypassWarning() {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(true)
  if (!open) return null

  return (
    <Dialog
      title="Authentication disabled"
      onClose={() => setOpen(false)}
      width={380}
      footer={
        <Button onClick={() => setOpen(false)}>OK</Button>
      }
    >
      <div className="flex gap-3 text-base">
        <Icon icon={TriangleAlert} size={28} className="text-accent" />
        <p>
          <code>OVC_AUTH_MODE=stub</code> is set - no login is required and every
          request is treated as <strong>{user?.email}</strong> with
          full administrator access. Anyone who can reach this instance can
          manage every host and VM. Unset it and configure a real OIDC
          provider before exposing this instance beyond a trusted network.
        </p>
      </div>
    </Dialog>
  )
}
