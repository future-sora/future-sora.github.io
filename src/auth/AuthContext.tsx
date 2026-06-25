import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  requestToken,
  getValidToken,
  signOut as doSignOut,
  fetchUserEmail,
  isGisLoaded,
  storedValidToken,
  hadStoredSession,
} from '../lib/googleAuth'
import { PERSON_BY_EMAIL, type Person } from '../config'

interface AuthValue {
  ready: boolean
  /** 새로고침 시 저장된 세션 복원을 시도하는 중. true면 로그인 화면 대신 대기 표시. */
  bootstrapping: boolean
  token: string | null
  email: string | null
  person: Person | null
  signIn: () => Promise<void>
  signOut: () => void
  getToken: () => Promise<string>
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

const AuthCtx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isGisLoaded())
  const [bootstrapping, setBootstrapping] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  // GIS 스크립트(async 로드) 준비 대기
  useEffect(() => {
    if (ready) return
    const id = setInterval(() => {
      if (isGisLoaded()) {
        setReady(true)
        clearInterval(id)
      }
    }, 150)
    return () => clearInterval(id)
  }, [ready])

  // 새로고침 시 세션 복원: 저장 토큰이 유효하면 그대로, 만료면 무팝업 재인증을 시도한다.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    ;(async () => {
      try {
        const stored = storedValidToken()
        if (stored) {
          const e = await fetchUserEmail(stored) // 이메일 조회 겸 토큰 유효성 확인
          if (cancelled) return
          if (e !== null) {
            setToken(stored)
            setEmail(e)
            return
          }
        }
        if (hadStoredSession()) {
          // 만료/무효지만 과거 로그인 흔적 → UI 없는 재인증 시도(실패해도 팝업 없음)
          const t = await withTimeout(requestToken('none'), 5000)
          if (cancelled) return
          setToken(t)
          setEmail(await fetchUserEmail(t))
        }
      } catch {
        /* 세션 없음/동의 필요 → 로그인 화면으로 */
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  async function signIn() {
    const t = await requestToken('consent')
    setToken(t)
    setEmail(await fetchUserEmail(t))
  }

  function signOut() {
    doSignOut()
    setToken(null)
    setEmail(null)
  }

  const person: Person | null = email ? PERSON_BY_EMAIL[email] ?? null : null

  const value: AuthValue = {
    ready,
    bootstrapping,
    token,
    email,
    person,
    signIn,
    signOut,
    getToken: getValidToken,
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
