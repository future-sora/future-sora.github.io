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
} from '../lib/googleAuth'
import { PERSON_BY_EMAIL, type Person } from '../config'

interface AuthValue {
  ready: boolean
  token: string | null
  email: string | null
  person: Person | null
  signIn: () => Promise<void>
  signOut: () => void
  getToken: () => Promise<string>
}

const AuthCtx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isGisLoaded())
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
