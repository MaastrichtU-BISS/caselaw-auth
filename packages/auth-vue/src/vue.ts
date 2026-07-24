import {
  computed,
  inject,
  onMounted,
  reactive,
  readonly,
  type App,
  type InjectionKey,
} from 'vue'
import { createAuthClient, type OidcAuthClient } from '@caselaw/auth-client'
import type { AuthConfig, AuthSession, AuthState, LoginOptions } from '@caselaw/auth-client'

export interface CaselawAuth {
  client: OidcAuthClient
  state: Readonly<AuthState>
  init: () => Promise<void>
  login: (options?: LoginOptions) => Promise<void>
  handleCallback: (callbackUrl?: string) => Promise<AuthSession>
  logout: (returnTo?: string) => Promise<void>
  refresh: () => Promise<AuthSession | null>
  hasRole: (role: string) => boolean
  hasAnyRole: (roles: string[]) => boolean
  requireRole: (role: string) => Promise<boolean>
}

export const CaselawAuthKey: InjectionKey<CaselawAuth> = Symbol('CaselawAuth')

export function createCaselawAuth(config: AuthConfig): CaselawAuth {
  const client = createAuthClient(config)
  const mutable = reactive<AuthState>({
    status: 'loading',
    ready: false,
    session: null,
    user: null,
    error: null,
    isAuthenticated: false,
  })

  const setSession = (session: AuthSession | null) => {
    mutable.session = session
    mutable.user = session?.user || null
    mutable.isAuthenticated = Boolean(session)
    mutable.status = session ? 'authenticated' : 'anonymous'
  }

  const fail = (error: unknown) => {
    mutable.error = error instanceof Error ? error : new Error(String(error))
    mutable.session = null
    mutable.user = null
    mutable.isAuthenticated = false
    mutable.status = 'error'
  }

  const auth: CaselawAuth = {
    client,
    state: readonly(mutable) as Readonly<AuthState>,
    async init() {
      mutable.status = 'loading'
      mutable.error = null
      try {
        let session = client.getSession()
        if (client.shouldRefresh(session)) session = await client.refresh()
        setSession(session)
      } catch (error) {
        fail(error)
      } finally {
        mutable.ready = true
      }
    },
    async login(options) {
      await client.login(options)
    },
    async handleCallback(callbackUrl) {
      mutable.status = 'loading'
      const session = await client.handleCallback(callbackUrl)
      setSession(session)
      mutable.ready = true
      return session
    },
    async logout(returnTo) {
      setSession(null)
      await client.logout(returnTo)
    },
    async refresh() {
      const session = await client.refresh()
      setSession(session)
      return session
    },
    hasRole(role) {
      return client.hasRole(role, mutable.session)
    },
    hasAnyRole(roles) {
      return client.hasAnyRole(roles, mutable.session)
    },
    async requireRole(role) {
      if (!mutable.ready) await auth.init()
      return auth.hasRole(role)
    },
  }

  return auth
}

export function createCaselawAuthPlugin(config: AuthConfig) {
  const auth = createCaselawAuth(config)
  return {
    auth,
    install(app: App) {
      app.provide(CaselawAuthKey, auth)
      app.config.globalProperties.$auth = auth
    },
  }
}

export function useAuth(): CaselawAuth {
  const auth = inject(CaselawAuthKey)
  if (!auth) throw new Error('Caselaw auth plugin is not installed.')
  return auth
}

export function useAuthState() {
  const auth = useAuth()
  return {
    status: computed(() => auth.state.status),
    ready: computed(() => auth.state.ready),
    session: computed(() => auth.state.session),
    user: computed(() => auth.state.user),
    error: computed(() => auth.state.error),
    isAuthenticated: computed(() => auth.state.isAuthenticated),
  }
}

export function useAuthInit(): void {
  const auth = useAuth()
  onMounted(() => {
    void auth.init()
  })
}
