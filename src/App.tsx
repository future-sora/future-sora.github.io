import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { pingSpreadsheet } from './lib/sheets'
import './App.css'

function App() {
  const { ready, token, email, person, signIn, signOut } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<string | null>(null)

  async function handleLogin() {
    setError(null)
    try {
      await signIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    if (!token) {
      setSheet(null)
      return
    }
    pingSpreadsheet().then((r) => {
      if (r.ok) setSheet(r.title ?? '(제목 없음)')
      else setError(`시트 접근 실패: ${r.error}`)
    })
  }, [token])

  if (!token) {
    return (
      <main className="auth">
        <h1>kakebu 가계부</h1>
        <p>구글 계정으로 로그인하세요.</p>
        <button type="button" onClick={handleLogin} disabled={!ready}>
          {ready ? 'Google 로그인' : '로딩 중…'}
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    )
  }

  return (
    <main className="app">
      <header>
        <h1>kakebu</h1>
        <div className="userbar">
          <span>
            {email} {person ? `(${person})` : '(사람 미지정)'}
          </span>
          <button type="button" onClick={signOut}>
            로그아웃
          </button>
        </div>
      </header>
      <p>시트 연결: {sheet ? `✓ ${sheet}` : '확인 중…'}</p>
      {error && <p className="error">{error}</p>}
      {/* 다음 단계(T4~): 월별 입력·집계·대시보드·자산/목표 */}
    </main>
  )
}

export default App
