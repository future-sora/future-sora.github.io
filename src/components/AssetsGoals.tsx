import { useMemo, useState, type FormEvent } from 'react'
import { useData } from '../data/DataContext'
import { useAuth } from '../auth/AuthContext'
import { PERSONS, type Person } from '../config'
import type { AssetEntry, Goal } from '../domain/types'
import { totalAssets, goalProgress } from '../domain/aggregate'
import { kindSuggestions } from '../domain/categories'
import { newId, currentMonth, fmtMoney } from '../lib/util'

interface AssetForm {
  editId: string | null
  person: Person
  kind: string
  amount: string
}
interface GoalForm {
  editId: string | null
  name: string
  targetAmount: string
  targetDate: string
}

export function AssetsGoals() {
  const { assets, goals, assetOps, goalOps } = useData()
  const { person: myPerson } = useAuth()
  const total = useMemo(() => totalAssets(assets), [assets])
  const kinds = useMemo(() => kindSuggestions(assets), [assets])

  const emptyAsset = (): AssetForm => ({
    editId: null,
    person: myPerson ?? PERSONS[0],
    kind: '',
    amount: '',
  })
  const emptyGoal = (): GoalForm => ({
    editId: null,
    name: '',
    targetAmount: '',
    targetDate: currentMonth(),
  })

  const [af, setAf] = useState<AssetForm>(emptyAsset)
  const [gf, setGf] = useState<GoalForm>(emptyGoal)
  const [aerr, setAerr] = useState<string | null>(null)
  const [gerr, setGerr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submitAsset(e: FormEvent) {
    e.preventDefault()
    const kind = af.kind.trim()
    const amount = Number(af.amount)
    if (!kind) return setAerr('종류를 입력하세요.')
    if (!Number.isFinite(amount) || amount <= 0)
      return setAerr('금액은 0보다 큰 숫자여야 합니다.')
    const entry: AssetEntry = {
      id: af.editId ?? newId(),
      person: af.person,
      kind,
      amount,
    }
    setBusy(true)
    try {
      if (af.editId) await assetOps.update(entry)
      else await assetOps.add(entry)
      setAf(emptyAsset())
      setAerr(null)
    } catch {
      setAerr('저장에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function submitGoal(e: FormEvent) {
    e.preventDefault()
    const name = gf.name.trim()
    const targetAmount = Number(gf.targetAmount)
    if (!name) return setGerr('목표명을 입력하세요.')
    if (!Number.isFinite(targetAmount) || targetAmount <= 0)
      return setGerr('목표액은 0보다 큰 숫자여야 합니다.')
    if (!/^\d{4}-\d{2}$/.test(gf.targetDate))
      return setGerr('목표 시점을 YYYY-MM으로 입력하세요.')
    const goal: Goal = {
      id: gf.editId ?? newId(),
      name,
      targetAmount,
      targetDate: gf.targetDate,
    }
    setBusy(true)
    try {
      if (gf.editId) await goalOps.update(goal)
      else await goalOps.add(goal)
      setGf(emptyGoal())
      setGerr(null)
    } catch {
      setGerr('저장에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3>자산 (총 {fmtMoney(total)} 만원)</h3>
      <form onSubmit={submitAsset} className="entry-form">
        <select
          value={af.person}
          onChange={(e) => setAf({ ...af, person: e.target.value as Person })}
        >
          {PERSONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          list="kind-suggestions"
          placeholder="종류"
          value={af.kind}
          onChange={(e) => setAf({ ...af, kind: e.target.value })}
        />
        <datalist id="kind-suggestions">
          {kinds.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder="금액(만원)"
          value={af.amount}
          onChange={(e) => setAf({ ...af, amount: e.target.value })}
        />
        <button type="submit" disabled={busy}>
          {af.editId ? '수정' : '추가'}
        </button>
        {af.editId && (
          <button type="button" disabled={busy} onClick={() => setAf(emptyAsset())}>
            취소
          </button>
        )}
      </form>
      {aerr && <p className="error">{aerr}</p>}
      <table className="ledger">
        <thead>
          <tr>
            <th>사람</th>
            <th>종류</th>
            <th>금액</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {assets.length === 0 && (
            <tr>
              <td colSpan={4}>자산이 없습니다.</td>
            </tr>
          )}
          {assets.map((a) => (
            <tr key={a.id}>
              <td>{a.person}</td>
              <td>{a.kind}</td>
              <td className="num">{fmtMoney(a.amount)}</td>
              <td>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setAf({
                      editId: a.id,
                      person: a.person,
                      kind: a.kind,
                      amount: String(a.amount),
                    })
                  }
                >
                  수정
                </button>
                <button type="button" disabled={busy} onClick={() => assetOps.remove(a.id)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>목표 (현재 자산총액 기준 진행률)</h3>
      <form onSubmit={submitGoal} className="entry-form">
        <input
          placeholder="목표명"
          value={gf.name}
          onChange={(e) => setGf({ ...gf, name: e.target.value })}
        />
        <input
          type="number"
          step="1"
          min="0"
          placeholder="목표액(만원)"
          value={gf.targetAmount}
          onChange={(e) => setGf({ ...gf, targetAmount: e.target.value })}
        />
        <input
          type="month"
          value={gf.targetDate}
          onChange={(e) => setGf({ ...gf, targetDate: e.target.value })}
        />
        <button type="submit" disabled={busy}>
          {gf.editId ? '수정' : '추가'}
        </button>
        {gf.editId && (
          <button type="button" disabled={busy} onClick={() => setGf(emptyGoal())}>
            취소
          </button>
        )}
      </form>
      {gerr && <p className="error">{gerr}</p>}
      <table className="ledger">
        <thead>
          <tr>
            <th>목표</th>
            <th>목표액</th>
            <th>시점</th>
            <th>진행률</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {goals.length === 0 && (
            <tr>
              <td colSpan={5}>목표가 없습니다.</td>
            </tr>
          )}
          {goals.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td className="num">{fmtMoney(g.targetAmount)}</td>
              <td>{g.targetDate}</td>
              <td className="num">{(goalProgress(g, total) * 100).toFixed(1)}%</td>
              <td>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setGf({
                      editId: g.id,
                      name: g.name,
                      targetAmount: String(g.targetAmount),
                      targetDate: g.targetDate,
                    })
                  }
                >
                  수정
                </button>
                <button type="button" disabled={busy} onClick={() => goalOps.remove(g.id)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
