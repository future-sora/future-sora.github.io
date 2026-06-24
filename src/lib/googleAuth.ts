import { GOOGLE_CLIENT_ID, SCOPES } from '../config'
import type { TokenClient, TokenResponse } from '../types/gsi'

let tokenClient: TokenClient | null = null
let accessToken: string | null = null
let expiresAt = 0

export function isGisLoaded(): boolean {
  return typeof window !== 'undefined' && !!window.google
}

function ensureClient(): TokenClient {
  if (tokenClient) return tokenClient
  if (!window.google) {
    throw new Error('Google Identity Services가 아직 로드되지 않았습니다.')
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: () => {},
  })
  return tokenClient
}

export function requestToken(prompt: '' | 'consent' = 'consent'): Promise<string> {
  return new Promise((resolve, reject) => {
    let client: TokenClient
    try {
      client = ensureClient()
    } catch (e) {
      return reject(e)
    }
    client.callback = (resp: TokenResponse) => {
      if (resp.error) {
        return reject(new Error(resp.error_description || resp.error))
      }
      accessToken = resp.access_token
      expiresAt = Date.now() + resp.expires_in * 1000
      resolve(resp.access_token)
    }
    client.requestAccessToken({ prompt })
  })
}

// 유효 토큰 반환. 만료 임박이면 조용히 갱신 시도(이미 동의했으면 팝업 없이).
export async function getValidToken(): Promise<string> {
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken
  return requestToken('')
}

export function signOut(): void {
  if (accessToken && window.google) {
    window.google.accounts.oauth2.revoke(accessToken)
  }
  accessToken = null
  expiresAt = 0
}

export async function fetchUserEmail(token: string): Promise<string | null> {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  const j = (await r.json()) as { email?: string }
  return j.email ?? null
}
