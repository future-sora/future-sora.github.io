// Google Identity Services (token model) 최소 타입 선언
export interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  error?: string
  error_description?: string
}

export interface TokenClient {
  callback: (resp: TokenResponse) => void
  requestAccessToken: (overrideConfig?: {
    prompt?: '' | 'none' | 'consent' | 'select_account'
  }) => void
}

export interface TokenClientConfig {
  client_id: string
  scope: string
  callback?: (resp: TokenResponse) => void
  error_callback?: (err: unknown) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}
