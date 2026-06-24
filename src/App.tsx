import { lazy, Suspense, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { DataProvider, useData } from './data/DataContext'
import { MonthlyView } from './components/MonthlyView'
import { AssetsGoals } from './components/AssetsGoals'
import { errMsg } from './lib/util'
import './App.css'

// recharts가 무거워 대시보드는 탭 진입 시 지연 로드
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
)

type Tab = 'monthly' | 'dashboard' | 'assets' | 'import'

function App() {
  const { token, ready, signIn } = useAuth()
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
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'monthly', label: '월별 입력' },
  { key: 'dashboard', label: '대시보드' },
  { key: 'assets', label: '자산·목표' },
  { key: 'import', label: '가져오기' },
]

function Shell() {
  const { email, person, signOut } = useAuth()
  const { loading, error } = useData()
  const [tab, setTab] = useState<Tab>('monthly')

  return (
    <div className="app">
      <header className="app-header">
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

      {loading && <p className="muted">불러오는 중…</p>}
      {error && <p className="error">오류: {error}</p>}

      <main className="content">
        {tab === 'monthly' && <MonthlyView />}
        {tab === 'dashboard' && (
          <Suspense fallback={<p className="muted">차트 로딩…</p>}>
            <Dashboard />
          </Suspense>
        )}
        {tab === 'assets' && <AssetsGoals />}
        {tab === 'import' && <p className="muted">가져오기 — 준비 중 (T10)</p>}
      </main>
    </div>
  )
}

export default App
