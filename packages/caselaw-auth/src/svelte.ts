import { derived, writable, type Readable } from 'svelte/store'
import { createAuthClient, type OidcAuthClient } from './client'
import type { AuthConfig, AuthSession, AuthState, LoginOptions } from './types'

export interface CaselawSvelteAuth {
  client: OidcAuthClient
  state: Readable<AuthState>
  session: Readable<AuthSession | null>
  user: Readable<AuthSession['user'] | null>
  isAuthenticated: Readable<boolean>
  init: () => Promise<AuthSession | null>
  login: (options?: LoginOptions) => Promise<void>
  handleCallback: (callbackUrl?: string) => Promise<AuthSession>
  logout: (returnTo?: string) => Promise<void>
  refresh: () => Promise<AuthSession | null>
  hasRole: (role: string) => boolean
  hasAnyRole: (roles: string[]) => boolean
}

const initialState: AuthState = {
  status: 'loading',
  ready: false,
  session: null,
  user: null,
  error: null,
  isAuthenticated: false,
}

export function createSvelteAuth(config: AuthConfig): CaselawSvelteAuth {
  const client = createAuthClient(config)
  const state = writable<AuthState>(initialState)

  const setSession = (session: AuthSession | null) => {
    state.set({
      status: session ? 'authenticated' : 'anonymous',
      ready: true,
      session,
      user: session?.user || null,
      error: null,
      isAuthenticated: Boolean(session),
    })
  }

  const setError = (error: unknown) => {
    state.set({
      status: 'error',
      ready: true,
      session: null,
      user: null,
      error: error instanceof Error ? error : new Error(String(error)),
      isAuthenticated: false,
    })
  }

  const auth: CaselawSvelteAuth = {
    client,
    state,
    session: derived(state, ($state) => $state.session),
    user: derived(state, ($state) => $state.user),
    isAuthenticated: derived(state, ($state) => $state.isAuthenticated),
    async init() {
      state.update(($state) => ({ ...$state, status: 'loading', error: null }))
      try {
        let session = client.getSession()
        if (client.shouldRefresh(session)) session = await client.refresh()
        setSession(session)
        return session
      } catch (error) {
        setError(error)
        return null
      }
    },
    async login(options) {
      await client.login(options)
    },
    async handleCallback(callbackUrl) {
      state.update(($state) => ({ ...$state, status: 'loading', error: null }))
      try {
        const session = await client.handleCallback(callbackUrl)
        setSession(session)
        return session
      } catch (error) {
        setError(error)
        throw error
      }
    },
    async logout(returnTo) {
      // Deliberately not clearing the reactive session first. Doing so told
      // this application it was signed out while the redirect to the provider
      // was still being worked out, and its route guard reacted by sending
      // the browser to sign in again, cancelling the sign-out. The navigation
      // below is the state change; there is nothing left to render after it.
      await client.logout(returnTo)
    },
    async refresh() {
      const session = await client.refresh()
      setSession(session)
      return session
    },
    hasRole(role) {
      return client.hasRole(role)
    },
    hasAnyRole(roles) {
      return client.hasAnyRole(roles)
    },
  }

  return auth
}
