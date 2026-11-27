import { GOOGLE_CLIENT_ID, SCOPES } from '../config'
import type { TokenClient, TokenResponse } from '../types/gsi'

const STORAGE_KEY = 'kakebu.token'
const HINT_KEY = 'kakebu.account' // 마지막 로그인 이메일 — 다음 로그인 때 계정 선택을 건너뛴다

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

/** 로그인한 계정 이메일을 기억한다(다음 토큰 요청의 login_hint). */
export function rememberAccount(email: string): void {
  try {
    localStorage.setItem(HINT_KEY, email)
  } catch {
    /* 스토리지 불가 — 힌트 없이 동작 */
  }
}

function accountHint(): string | undefined {
  try {
    return localStorage.getItem(HINT_KEY) ?? undefined
  } catch {
    return undefined
  }
}

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
 * 토큰 요청. prompt: 'consent'=동의창, ''=처음 한 번만 동의(이후엔 팝업이 바로 닫힘), 'none'=UI 없이(없으면 에러).
 * 기억해 둔 계정이 있으면 login_hint로 넘겨 계정 선택을 건너뛴다.
 * 자동 갱신 요청은 동시 호출을 하나로 합치고, 사용자 요청(interactive, 로그인 버튼)은
 * 진행 중 요청에 합류하지 않고 항상 새 요청으로 그것을 대체한다.
 */
export function requestToken(
  prompt: '' | 'none' | 'consent' = 'consent',
  interactive = prompt === 'consent',
): Promise<string> {
  const silent = !interactive
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
    const hint = accountHint()
    client.requestAccessToken(hint ? { prompt, login_hint: hint } : { prompt })
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
  try {
    localStorage.removeItem(HINT_KEY) // 로그아웃하면 다른 계정으로 고를 수 있게
  } catch {
    /* 무시 */
  }
}

export async function fetchUserEmail(token: string): Promise<string | null> {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  const j = (await r.json()) as { email?: string }
  return j.email ?? null
}
