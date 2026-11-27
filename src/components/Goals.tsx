import { useEffect, useMemo, useState } from 'react'
import { useData } from '../data/DataContext'
import { PERSONS, type Person } from '../config'
import type { Goal, RateEntry } from '../domain/types'
import { isaValuation } from '../domain/aggregate'
import { ISA_KIND, isaSavings, sumAsset } from '../domain/isa'
import { newId, currentMonth, fmtMoney } from '../lib/util'
import { LoadingOverlay } from './LoadingOverlay'

interface GoalRow {
  id: string // React key. 기존 목표는 goal.id, 추가 행은 uuid.
  goalId: string | null // 기존 목표 id(저장 시 재사용). 새 행은 null.
  kind: string // 저축 종류(자산 종류 중 선택)
  targetAmount: string
  targetDate: string
}

/** 사람별 수익률 입력 문자열(미지정은 빈칸). */
function buildRateRows(rates: RateEntry[]): Record<Person, string> {
  const by = new Map(rates.map((r) => [r.person, r.rate]))
  return Object.fromEntries(
    PERSONS.map((p) => [p, by.has(p) ? String(by.get(p)) : '']),
  ) as Record<Person, string>
}

function buildGoalRows(goals: Goal[]): GoalRow[] {
  return goals.map((g) => ({
    id: g.id,
    goalId: g.id,
    kind: g.kind,
    targetAmount: fmtMoney(g.targetAmount),
    targetDate: g.targetDate,
  }))
}

function emptyGoalRow(): GoalRow {
  return { id: newId(), goalId: null, kind: '', targetAmount: '', targetDate: currentMonth() }
}

export function Goals() {
  const { assets, goals, ledger, rates, rewriteGoals, saveRates } = useData()
  const isa = useMemo(() => isaSavings(ledger), [ledger])
  // ISA 평가금액 = 사람별 원금에 각자의 수익률 적용한 합. 목표(ISA) 진행률 분자.
  const isaVal = useMemo(() => isaValuation(isa, rates), [isa, rates])

  // === ISA 수익률 ===
  const [rateRows, setRateRows] = useState<Record<Person, string>>(() => buildRateRows(rates))
  const [rateEditing, setRateEditing] = useState(false)
  const [rdirty, setRdirty] = useState(false)
  const [rerr, setRerr] = useState<string | null>(null)
  const [rbusy, setRbusy] = useState(false)

  useEffect(() => {
    setRateRows(buildRateRows(rates))
    setRdirty(false)
    setRerr(null)
  }, [rates])

  function setRate(p: Person, value: string) {
    setRateRows((rr) => ({ ...rr, [p]: value }))
    setRdirty(true)
  }
  function cancelRates() {
    setRateEditing(false)
    setRateRows(buildRateRows(rates))
    setRdirty(false)
    setRerr(null)
  }
  async function saveRateRows() {
    const entries: RateEntry[] = []
    for (const p of PERSONS) {
      const raw = rateRows[p].trim()
      if (raw === '') continue // 미입력은 0%(저장 안 함)
      const v = Number(raw)
      if (!Number.isFinite(v)) {
        setRerr(`수익률은 숫자여야 합니다. (${p})`)
        return
      }
      entries.push({ person: p, rate: v })
    }
    setRbusy(true)
    setRerr(null)
    try {
      await saveRates(entries)
      setRateEditing(false)
    } catch {
      setRerr('저장에 실패했습니다. 다시 시도하세요.')
    } finally {
      setRbusy(false)
    }
  }

  // === 목표 ===
  const [goalRows, setGoalRows] = useState<GoalRow[]>(() => buildGoalRows(goals))
  const [goalEditing, setGoalEditing] = useState(false)
  const [gdirty, setGdirty] = useState(false)
  const [gerr, setGerr] = useState<string | null>(null)
  const [gbusy, setGbusy] = useState(false)

  useEffect(() => {
    setGoalRows(buildGoalRows(goals))
    setGdirty(false)
    setGerr(null)
  }, [goals])

  // 목표 종류별 현재값(만원). ISA는 수익률 적용 평가금액, 그 외는 해당 종류 자산 합.
  function currentByKind(kind: string): number {
    if (kind === ISA_KIND) return isaVal
    return PERSONS.reduce((s, p) => s + sumAsset(assets, kind, p), 0)
  }
  // 진행률 원본이 있는 자산 종류(시트에 행이 있는 것). 없으면 0%가 아니라 '데이터 없음'.
  const assetKindsWithData = useMemo(
    () => new Set(assets.map((a) => a.kind).filter((k) => k !== ISA_KIND)),
    [assets],
  )
  // ISA 평가에 수익률이 빠진 사람이 있나(빠지면 0%로 계산되어 원금만 잡힘).
  const isaRateMissing = PERSONS.some((p) => !rates.some((r) => r.person === p))

  function setGoalField(rowId: string, field: 'kind' | 'targetAmount' | 'targetDate', value: string) {
    setGoalRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)))
    setGdirty(true)
  }
  function addGoalRow() {
    setGoalRows((rs) => [...rs, emptyGoalRow()])
    setGdirty(true)
  }
  function removeGoalRow(rowId: string) {
    setGoalRows((rs) => rs.filter((r) => r.id !== rowId))
    setGdirty(true)
  }
  function cancelGoals() {
    setGoalEditing(false)
    setGoalRows(buildGoalRows(goals))
    setGdirty(false)
    setGerr(null)
  }
  async function saveGoals() {
    const entries: Goal[] = []
    for (const row of goalRows) {
      const kind = row.kind.trim()
      if (!kind) continue // 종류 없는 행은 건너뜀
      const amt = Number(row.targetAmount)
      if (!Number.isFinite(amt) || amt <= 0) {
        setGerr(`목표액은 0보다 큰 숫자여야 합니다. (${kind})`)
        return
      }
      if (!/^\d{4}-\d{2}$/.test(row.targetDate)) {
        setGerr(`시점을 YYYY-MM으로 입력하세요. (${kind})`)
        return
      }
      entries.push({ id: row.goalId ?? newId(), kind, targetAmount: amt, targetDate: row.targetDate })
    }
    setGbusy(true)
    setGerr(null)
    try {
      await rewriteGoals(entries)
      setGoalEditing(false)
    } catch {
      setGerr('저장에 실패했습니다. 다시 시도하세요.')
    } finally {
      setGbusy(false)
    }
  }

  const goalKindOptions = useMemo(
    () => [ISA_KIND, ...assetKindsWithData],
    [assetKindsWithData],
  )

  return (
    <section>
      <LoadingOverlay show={rbusy || gbusy} />

      {/* 목표 */}
      <div className="monthly-top">
        <h3>목표 (종류별 진행률)</h3>
        <span className="monthly-actions">
          {goalEditing ? (
            <>
              <button type="button" className="next-month" onClick={cancelGoals} disabled={gbusy}>
                취소
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={saveGoals}
                disabled={!gdirty || gbusy}
              >
                {gbusy ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            <button type="button" className="next-month" onClick={() => setGoalEditing(true)}>
              편집
            </button>
          )}
        </span>
      </div>
      {gerr && <p className="error">{gerr}</p>}
      <table className="grid">
        <thead>
          <tr>
            <th>저축 종류</th>
            <th className="num">목표액</th>
            <th>시점</th>
            {goalEditing ? <th className="num"></th> : <th className="num">진행률</th>}
          </tr>
        </thead>
        <tbody>
          {goalRows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                {goalEditing ? '아래 + 로 목표를 추가하세요.' : '목표가 없습니다.'}
              </td>
            </tr>
          )}
          {goalRows.map((row) => {
            const cur = currentByKind(row.kind)
            const tgt = Number(row.targetAmount)
            const pct = Number.isFinite(tgt) && tgt > 0 ? (cur / tgt) * 100 : 0
            return (
              <tr key={row.id}>
                <td>
                  {goalEditing ? (
                    <input
                      className="item-input"
                      list="goal-kinds"
                      placeholder="종류 선택"
                      value={row.kind}
                      onChange={(e) => setGoalField(row.id, 'kind', e.target.value)}
                    />
                  ) : (
                    row.kind
                  )}
                </td>
                <td className="num">
                  {goalEditing ? (
                    <input
                      type="number"
                      step="1"
                      min="0"
                      inputMode="decimal"
                      className="amount-input"
                      value={row.targetAmount}
                      onChange={(e) => setGoalField(row.id, 'targetAmount', e.target.value)}
                    />
                  ) : (
                    row.targetAmount
                  )}
                </td>
                <td>
                  {goalEditing ? (
                    <input
                      type="month"
                      value={row.targetDate}
                      onChange={(e) => setGoalField(row.id, 'targetDate', e.target.value)}
                    />
                  ) : (
                    row.targetDate
                  )}
                </td>
                {goalEditing ? (
                  <td className="num">
                    <button
                      type="button"
                      className="row-btn row-del"
                      title="삭제"
                      onClick={() => removeGoalRow(row.id)}
                    >
                      ✕
                    </button>
                  </td>
                ) : (
                  <td className="num">
                    {row.kind !== ISA_KIND && !assetKindsWithData.has(row.kind) ? (
                      <span className="muted">자산 데이터 없음</span>
                    ) : (
                      <>
                        {fmtMoney(cur)} ({pct.toFixed(1)}%)
                        {row.kind === ISA_KIND && isaRateMissing && (
                          <span className="muted"> · 수익률 미입력</span>
                        )}
                      </>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
        {goalEditing && (
          <tfoot>
            <tr>
              <td colSpan={4}>
                <button type="button" className="add-row" onClick={addGoalRow}>
                  + 목표 추가
                </button>
                <datalist id="goal-kinds">
                  {goalKindOptions.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      <p className="muted assets-note">ISA 목표는 두 사람 수익률을 적용한 평가금액 기준</p>

      {/* ISA 수익률 */}
      <div className="monthly-top">
        <h3>ISA 수익률</h3>
        <span className="monthly-actions">
          {rateEditing ? (
            <>
              <button type="button" className="next-month" onClick={cancelRates} disabled={rbusy}>
                취소
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={saveRateRows}
                disabled={!rdirty || rbusy}
              >
                {rbusy ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            <button type="button" className="next-month" onClick={() => setRateEditing(true)}>
              편집
            </button>
          )}
        </span>
      </div>
      {rerr && <p className="error">{rerr}</p>}
      <table className="grid">
        <thead>
          <tr>
            <th></th>
            {PERSONS.map((p) => (
              <th key={p} className="num">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>수익률(%)</td>
            {PERSONS.map((p) => (
              <td key={p} className="num">
                {rateEditing ? (
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    className="amount-input"
                    value={rateRows[p]}
                    onChange={(e) => setRate(p, e.target.value)}
                  />
                ) : (
                  `${rateRows[p] || '0'}%`
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="muted assets-note">ISA 원금에 적용할 평가 수익률(%). 손실이면 음수</p>
    </section>
  )
}
