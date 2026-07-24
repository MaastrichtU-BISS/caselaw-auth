export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error'

export interface AuthConfig {
  issuer: string
  clientId: string
  redirectUri: string
  postLogoutRedirectUri?: string
  scope?: string
  storageKey?: string
  refreshSkewSeconds?: number
  requiredRoles?: string[]
}

export interface LoginOptions {
  returnTo?: string
  prompt?: 'login' | 'none' | 'consent' | 'select_account'
  loginHint?: string
}

export interface AuthUser {
  sub: string
  email?: string
  emailVerified?: boolean
  name?: string
  preferredUsername?: string
  givenName?: string
  familyName?: string
  roles: string[]
  clientRoles: Record<string, string[]>
  claims: Record<string, unknown>
}

export interface AuthSession {
  accessToken: string
  idToken?: string
  refreshToken?: string
  tokenType: string
  expiresAt: number
  scope?: string
  user: AuthUser
}

export interface AuthState {
  status: AuthStatus
  ready: boolean
  session: AuthSession | null
  user: AuthUser | null
  error: Error | null
  isAuthenticated: boolean
}

export interface OidcDiscovery {
  authorization_endpoint: string
  token_endpoint: string
  end_session_endpoint?: string
  issuer: string
}

export interface TokenResponse {
  access_token: string
  id_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}
