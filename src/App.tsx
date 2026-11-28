import { lazy, Suspense, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { DataProvider, useData } from './data/DataContext'
import { MonthlyView } from './components/MonthlyView'
import { Assets } from './components/Assets'
import { Goals } from './components/Goals'
import { ErrorBoundary } from './components/ErrorBoundary'
import { errMsg } from './lib/util'
import './App.css'

// recharts가 무거워 대시보드는 탭 진입 시 지연 로드
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
)

type Tab = 'goals' | 'monthly' | 'dashboard' | 'assets'

function App() {
  const { token, ready, bootstrapping, signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    setError(null)
    try {
      await signIn()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  if (!token) {
    return (
      <main className="auth">
        <div className="auth-brand">
          <img className="auth-photo" src="/img/char-login.png" alt="우리 커플 캐릭터" />
          <h1>가계부</h1>
        </div>
        {bootstrapping ? (
          <p className="muted">로그인 확인 중…</p>
        ) : (
          <div className="auth-card">
            <button
              type="button"
              className="login-btn"
              onClick={handleLogin}
              disabled={!ready}
            >
              {ready ? 'Google 로그인' : '로딩 중…'}
            </button>
            {error && <p className="error">{error}</p>}
          </div>
        )}
        {/* 로그인 전 앱 설명 + 개인정보처리방침 링크(Google OAuth 브랜딩 인증 요건). */}
        <footer className="auth-about">
          <p>kakebu는 두 사람의 월별 수입·지출, 자산, 저축 목표를 본인의 Google 스프레드시트에 기록하고 집계하는 개인용 가계부입니다.</p>
          <a href="/privacy.html">개인정보처리방침</a>
        </footer>
      </main>
    )
  }

  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'goals', label: '목표' },
  { key: 'monthly', label: '월별 입력' },
  { key: 'assets', label: '자산' },
  { key: 'dashboard', label: '대시보드' },
]

function Shell() {
  const { email, person, signOut, signIn } = useAuth()
  const { loaded, loading, error, reload, clearError } = useData()
  const [tab, setTab] = useState<Tab>('goals')

  async function retryLogin() {
    clearError()
    try {
      await signIn()
    } catch {
      /* 사용자가 로그인 취소 */
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img className="brand-photo" src="/img/char-head.png" alt="" />
          <h1>가계부</h1>
        </div>
        <div className="userbar">
          <span>
            {email} {person || '사람 미지정'}
          </span>
          <button type="button" onClick={signOut}>
            로그아웃
          </button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loaded && loading && <p className="muted">불러오는 중…</p>}
      {error && (
        <div className="error-banner">
          <span className="error">오류: {error}</span>
          <span className="banner-actions">
            <button
              type="button"
              onClick={() => {
                clearError()
                void reload()
              }}
            >
              새로고침
            </button>
            <button type="button" onClick={retryLogin}>
              다시 로그인
            </button>
          </span>
        </div>
      )}

      <main className="content">
        {/* 첫 로드 전 빈 배열은 '데이터 없음'이 아니므로 화면 대신 로딩을 보여준다(실패하면 위 오류 배너만). */}
        {loaded ? (
          <ErrorBoundary>
            {tab === 'goals' && <Goals />}
            {tab === 'monthly' && <MonthlyView />}
            {tab === 'dashboard' && (
              <Suspense fallback={<p className="muted">차트 로딩…</p>}>
                <Dashboard />
              </Suspense>
            )}
            {tab === 'assets' && <Assets />}
          </ErrorBoundary>
        ) : (
          !error && (
            <div className="initial-loading" role="status">
              <img className="loading-img" src="/img/char-head.png" alt="" />
              <p className="muted">불러오는 중…</p>
            </div>
          )
        )}
      </main>
    </div>
  )
}

export default App
