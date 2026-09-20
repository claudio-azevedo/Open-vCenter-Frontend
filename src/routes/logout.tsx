import { createFileRoute } from '@tanstack/react-router'
import { logoutFn } from '~/auth'

export const Route = createFileRoute('/logout')({
  preload: false,
  loader: () => logoutFn(),
})
