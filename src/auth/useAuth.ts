import * as React from 'react'
import { AuthContext } from './provider'

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
