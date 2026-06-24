import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  ensureTabs,
  loadLedger,
  loadAssets,
  loadGoals,
  addLedger,
  updateLedger,
  deleteLedger,
  addAsset,
  updateAsset,
  deleteAsset,
  addGoal,
  updateGoal,
  deleteGoal,
} from '../lib/repo'
import { errMsg } from '../lib/util'
import type { LedgerEntry, AssetEntry, Goal } from '../domain/types'

interface Ops<T> {
  add: (x: T) => Promise<void>
  update: (x: T) => Promise<void>
  remove: (id: string) => Promise<void>
}

interface DataValue {
  loading: boolean
  error: string | null
  ledger: LedgerEntry[]
  assets: AssetEntry[]
  goals: Goal[]
  reload: () => Promise<void>
  clearError: () => void
  ledgerOps: Ops<LedgerEntry>
  assetOps: Ops<AssetEntry>
  goalOps: Ops<Goal>
}

const DataCtx = createContext<DataValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [assets, setAssets] = useState<AssetEntry[]>([])
  const [goals, setGoals] = useState<Goal[]>([])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [l, a, g] = await Promise.all([loadLedger(), loadAssets(), loadGoals()])
      setLedger(l)
      setAssets(a)
      setGoals(g)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setLedger([])
      setAssets([])
      setGoals([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        await ensureTabs()
        if (cancelled) return
        await reload()
      } catch (e) {
        if (!cancelled) {
          setError(errMsg(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, reload])

  // 변경 후 재로드. 에러는 상태에 담고 다시 던져 호출부가 알 수 있게.
  function makeOps<T>(
    add: (x: T) => Promise<void>,
    update: (x: T) => Promise<void>,
    remove: (id: string) => Promise<void>,
  ): Ops<T> {
    const run = async (fn: () => Promise<void>) => {
      setError(null)
      try {
        await fn()
        await reload()
      } catch (e) {
        setError(errMsg(e))
        throw e
      }
    }
    return {
      add: (x) => run(() => add(x)),
      update: (x) => run(() => update(x)),
      remove: (id) => run(() => remove(id)),
    }
  }

  const value: DataValue = {
    loading,
    error,
    ledger,
    assets,
    goals,
    reload,
    clearError: () => setError(null),
    ledgerOps: makeOps(addLedger, updateLedger, deleteLedger),
    assetOps: makeOps(addAsset, updateAsset, deleteAsset),
    goalOps: makeOps(addGoal, updateGoal, deleteGoal),
  }

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataValue {
  const v = useContext(DataCtx)
  if (!v) throw new Error('useData must be used within DataProvider')
  return v
}
