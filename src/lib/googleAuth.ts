import { GOOGLE_CLIENT_ID, SCOPES } from '../config'
import type { TokenClient, TokenResponse } from '../types/gsi'

const STORAGE_KEY = 'kakebu.token'

let tokenClient: TokenClient | null = null
let accessToken: string | null = null
let expiresAt = 0
let everSignedIn = false

// 한 번에 하나의 토큰 요청만 대기. callback/error_callback이 이 settler로 끝맺는다.
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null
// 동시 무팝업 요청은 하나로 합친다(예: 로드 시 시트 3개 동시 요청).
let silentInflight: Promise<string> | null = null

function settleResolve(t: string): void {
  const p = pending
  pending = null
  p?.resolve(t)
}
function settleReject(e: Error): void {
  const p = pending
  pending = null
  p?.reject(e)
}

// 새로고침에도 로그인 유지: 토큰+만료를 localStorage에 저장/복원.
function persist(): void {
  try {
    if (accessToken) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, expiresAt }))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* 스토리지 불가(시크릿 모드 등) — 메모리로만 동작 */
  }
}

function restore(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const v = JSON.parse(raw) as { accessToken?: string; expiresAt?: number }
    if (v.accessToken && typeof v.expiresAt === 'number') {
      accessToken = v.accessToken
      expiresAt = v.expiresAt
      everSignedIn = true
    }
  } catch {
    /* 손상된 값 무시 */
  }
}
restore()

export function isGisLoaded(): boolean {
  return typeof window !== 'undefined' && !!window.google
}

/** 만료 60초 여유를 두고 유효하면 저장된 토큰, 아니면 null. */
export function storedValidToken(): string | null {
  return accessToken && Date.now() < expiresAt - 60_000 ? accessToken : null
}

/** 과거에 로그인한 적이 있나(만료 토큰 포함). 무팝업 재인증 시도 여부 판단용. */
export function hadStoredSession(): boolean {
  return everSignedIn
}

function ensureClient(): TokenClient {
  if (tokenClient) return tokenClient
  if (!window.google) {
    throw new Error('Google Identity Services가 아직 로드되지 않았습니다.')
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (resp: TokenResponse) => {
      if (resp.error) {
        settleReject(new Error(resp.error_description || resp.error))
      } else {
        accessToken = resp.access_token
        expiresAt = Date.now() + resp.expires_in * 1000
        everSignedIn = true
        persist()
        settleResolve(resp.access_token)
      }
    },
    error_callback: (err) => {
      settleReject(new Error((err as { type?: string })?.type || 'token_error'))
    },
  })
  return tokenClient
}

/**
 * 토큰 요청. prompt: 'consent'=동의창, ''=세션 있으면 무팝업, 'none'=UI 없이(없으면 에러).
 * 무팝업 요청은 동시 호출을 하나로 합치고, consent는 진행 중 무팝업 요청을 대체한다.
 */
export function requestToken(
  prompt: '' | 'none' | 'consent' = 'consent',
): Promise<string> {
  const silent = prompt !== 'consent'
  if (silent && silentInflight) return silentInflight
  const p = new Promise<string>((resolve, reject) => {
    let client: TokenClient
    try {
      client = ensureClient()
    } catch (e) {
      return reject(e instanceof Error ? e : new Error(String(e)))
    }
    if (pending) settleReject(new Error('superseded'))
    pending = { resolve, reject }
    client.requestAccessToken({ prompt })
  })
  if (silent) {
    silentInflight = p
    void p.finally(() => {
      if (silentInflight === p) silentInflight = null
    })
  }
  return p
}

/** 유효 토큰 반환. 만료 임박이면 조용히 갱신(이미 동의했으면 팝업 없이). */
export async function getValidToken(): Promise<string> {
  const t = storedValidToken()
  if (t) return t
  return requestToken('')
}

export function signOut(): void {
  if (accessToken && window.google) {
    window.google.accounts.oauth2.revoke(accessToken)
  }
  accessToken = null
  expiresAt = 0
  everSignedIn = false
  persist()
}

export async function fetchUserEmail(token: string): Promise<string | null> {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  const j = (await r.json()) as { email?: string }
  return j.email ?? null
}
