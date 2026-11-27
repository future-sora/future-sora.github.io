import { useEffect, useMemo, useState } from 'react'
import { useData } from '../data/DataContext'
import { PERSONS, type Person } from '../config'
import type { AssetEntry, Goal, LedgerEntry, RateEntry } from '../domain/types'
import { isaValuation, summarizeMonth, listMonths } from '../domain/aggregate'
import { kindSuggestions } from '../domain/categories'
import { newId, currentMonth, fmtMoney } from '../lib/util'
import { useRowDnD } from '../lib/useRowDnD'
import { LoadingOverlay } from './LoadingOverlay'

interface AssetRow {
  id: string // React key. 기존 종류는 `k:kind`, 추가 행은 uuid.
  kind: string // 자산 종류(편집모드에서 변경 가능)
  amounts: Record<Person, string> // 사람별 입력 문자열(만원)
  derived?: boolean // 파생 행(ISA 원금,저축): ledger에서 자동 계산, 편집 불가
}

interface GoalRow {
  id: string // React key. 기존 목표는 goal.id, 추가 행은 uuid.
  goalId: string | null // 기존 목표 id(저장 시 재사용). 새 행은 null.
  kind: string // 저축 종류(자산 종류 중 선택)
  targetAmount: string
  targetDate: string
}

const ISA_KIND = 'ISA (원금,저축)'
const ISA_START = '2025-08' // 이 달부터의 누적 저축가능액을 ISA(원금,저축)으로 본다

/** 2025-08 이후 각 사람의 누적 저축가능액(소득−소비). ISA(원금,저축) 자동값(원금). */
function isaSavings(ledger: LedgerEntry[]): Record<Person, number> {
  const out = Object.fromEntries(PERSONS.map((p) => [p, 0])) as Record<Person, number>
  for (const m of listMonths(ledger)) {
    if (m < ISA_START) continue
    const s = summarizeMonth(ledger, m)
    // 저축가능액이 음수인 달은 0으로 본다(그 달은 저축 안 한 것).
    for (const p of PERSONS) out[p] += Math.max(0, s.byPerson[p].savable)
  }
  return out
}

function sumAsset(assets: AssetEntry[], kind: string, person: Person): number {
  return assets
    .filter((a) => a.kind === kind && a.person === person)
    .reduce((s, a) => s + a.amount, 0)
}

/**
 * 자산을 종류(행)×사람(열) 매트릭스 행으로 구성.
 * 시트 행 순서를 그대로 표시 순서로 쓴다(저장 시 현재 순서대로 재기록되므로 유지됨).
 */
function buildAssetRows(assets: AssetEntry[]): AssetRow[] {
  const kinds = [...new Set(assets.map((a) => a.kind))].filter((k) => k !== ISA_KIND)
  return kinds.map((kind) => ({
    id: `k:${kind}`,
    kind,
    amounts: Object.fromEntries(
      PERSONS.map((p) => {
        const v = sumAsset(assets, kind, p)
        return [p, v > 0 ? fmtMoney(v) : '']
      }),
    ) as Record<Person, string>,
  }))
}

function emptyAssetRow(): AssetRow {
  return {
    id: newId(),
    kind: '',
    amounts: Object.fromEntries(PERSONS.map((p) => [p, ''])) as Record<Person, string>,
  }
}

/** 파생 ISA 행(맨 위·편집 불가) + 시트 자산 행(시트 순서). */
function buildAllRows(assets: AssetEntry[], isa: Record<Person, number>): AssetRow[] {
  const derived: AssetRow = {
    id: 'isa-derived',
    kind: ISA_KIND,
    derived: true,
    amounts: Object.fromEntries(PERSONS.map((p) => [p, fmtMoney(isa[p])])) as Record<
      Person,
      string
    >,
  }
  return [derived, ...buildAssetRows(assets)]
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

export function AssetsGoals() {
  const { assets, goals, ledger, rates, rewriteAssets, rewriteGoals, saveRates } = useData()
  const kinds = useMemo(() => kindSuggestions(assets), [assets])
  const isa = useMemo(() => isaSavings(ledger), [ledger])
  // ISA 평가금액 = 사람별 원금에 각자의 수익률 적용한 합. 목표(ISA) 진행률 분자.
  const isaVal = useMemo(() => isaValuation(isa, rates), [isa, rates])
  // 합계·총액은 파생 ISA 원금을 포함(시트에 남은 ISA(원금,저축) 수동값은 제외).
  const byPerson = useMemo(
    () =>
      Object.fromEntries(
        PERSONS.map((p) => [
          p,
          assets
            .filter((a) => a.person === p && a.kind !== ISA_KIND)
            .reduce((s, a) => s + a.amount, 0) + isa[p],
        ]),
      ) as Record<Person, number>,
    [assets, isa],
  )
  const total = useMemo(() => PERSONS.reduce((s, p) => s + byPerson[p], 0), [byPerson])

  // === 자산 표 ===
  const [rows, setRows] = useState<AssetRow[]>(() => buildAllRows(assets, isa))
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [aerr, setAerr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 드래그로 행 순서 변경(파생 ISA 행은 이동·교차 금지).
  const dnd = useRowDnD<number>((from, to) => {
    setRows((rs) => {
      if (rs[from]?.derived || rs[to]?.derived) return rs
      const next = [...rs]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return next
    })
    setDirty(true)
  })

  // assets 변화 시 표 재구성(저장 후 재로드 포함). 편집 중 셀 변경은 setRows로만.
  useEffect(() => {
    setRows(buildAllRows(assets, isa))
    setDirty(false)
    setAerr(null)
  }, [assets, isa])

  // 종류 추가 후보: 프리셋 + 기존 종류 중, 표에 아직 없는 것.
  function unusedKinds(): string[] {
    const inGrid = new Set(rows.map((r) => r.kind.trim()).filter(Boolean))
    return kinds.filter((k) => !inGrid.has(k) && k !== ISA_KIND)
  }

  function setAmount(rowId: string, person: Person, value: string) {
    setRows((rs) =>
      rs.map((r) => (r.id === rowId ? { ...r, amounts: { ...r.amounts, [person]: value } } : r)),
    )
    setDirty(true)
  }
  function setKind(rowId: string, value: string) {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, kind: value } : r)))
    setDirty(true)
  }
  function addRow() {
    setRows((rs) => [...rs, emptyAssetRow()])
    setDirty(true)
  }
  function removeRow(rowId: string) {
    setRows((rs) => rs.filter((r) => r.id !== rowId))
    setDirty(true)
  }
  function cancel() {
    setEditing(false)
    setRows(buildAllRows(assets, isa))
    setDirty(false)
    setAerr(null)
  }

  async function save() {
    // 현재 표(행 순서 그대로)에서 유효 셀만 모아 자산 전체를 재기록한다.
    const idByKey = new Map<string, string>()
    for (const a of assets) idByKey.set(`${a.kind}|${a.person}`, a.id)

    const entries: AssetEntry[] = []
    const seen = new Set<string>()
    for (const row of rows) {
      if (row.derived) continue // 파생 ISA는 시트에 저장하지 않음
      const kind = row.kind.trim()
      if (!kind) continue
      for (const p of PERSONS) {
        const k = `${kind}|${p}`
        if (seen.has(k)) continue // 같은 종류 중복 행이면 첫 행만 반영
        seen.add(k)
        const raw = row.amounts[p].trim()
        if (raw === '') continue
        const v = Number(raw)
        if (!Number.isFinite(v) || v <= 0) {
          setAerr(`금액은 0보다 큰 숫자여야 합니다. (${kind} · ${p})`)
          return
        }
        entries.push({ id: idByKey.get(k) ?? newId(), person: p, kind, amount: v })
      }
    }

    setBusy(true)
    setAerr(null)
    try {
      await rewriteAssets(entries)
      setEditing(false)
    } catch {
      setAerr('저장에 실패했습니다. 다시 시도하세요.')
    } finally {
      setBusy(false)
    }
  }

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
      <LoadingOverlay show={busy || rbusy || gbusy} />

      {/* 자산 */}
      <div className="monthly-top">
        <h3>자산</h3>
        <span className="monthly-actions">
          {editing ? (
            <>
              <button type="button" className="next-month" onClick={cancel} disabled={busy}>
                취소
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={save}
                disabled={!dirty || busy}
              >
                {busy ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            <button type="button" className="next-month" onClick={() => setEditing(true)}>
              편집
            </button>
          )}
        </span>
      </div>
      {aerr && <p className="error">{aerr}</p>}
      <table className="grid">
        <thead>
          <tr>
            <th>종류</th>
            {PERSONS.map((p) => (
              <th key={p} className="num">
                {p}
              </th>
            ))}
            {editing && <th className="num"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={PERSONS.length + 1 + (editing ? 1 : 0)} className="muted">
                {editing ? '아래 + 로 항목을 추가하세요.' : '자산이 없습니다.'}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={row.id} {...(editing && !row.derived ? dnd.zone(i) : {})}>
              <td>
                {editing && !row.derived ? (
                  <span className="kind-edit">
                    <button
                      type="button"
                      className="row-btn drag-handle"
                      title="드래그로 순서 변경"
                      {...dnd.handle(i)}
                    >
                      ≡
                    </button>
                    <input
                      className="item-input"
                      list="asset-kinds"
                      placeholder="종류 선택/입력"
                      value={row.kind}
                      onChange={(e) => setKind(row.id, e.target.value)}
                    />
                  </span>
                ) : (
                  <>
                    {row.kind}
                    {row.derived && <span className="auto-tag">자동</span>}
                  </>
                )}
              </td>
              {PERSONS.map((p) => (
                <td key={p} className="num">
                  {editing && !row.derived ? (
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      inputMode="decimal"
                      className="amount-input"
                      value={row.amounts[p]}
                      onChange={(e) => setAmount(row.id, p, e.target.value)}
                    />
                  ) : (
                    row.amounts[p]
                  )}
                </td>
              ))}
              {editing && (
                <td className="num">
                  {!row.derived && (
                    <button
                      type="button"
                      className="row-btn row-del"
                      title="삭제"
                      onClick={() => removeRow(row.id)}
                    >
                      ✕
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {!editing && rows.length > 0 && (
            <>
              <tr className="total">
                <td>합계</td>
                {PERSONS.map((p) => (
                  <td key={p} className="num">
                    {fmtMoney(byPerson[p])}
                  </td>
                ))}
              </tr>
              <tr className="total">
                <td>총합</td>
                <td colSpan={PERSONS.length} className="num">
                  {fmtMoney(total)}
                </td>
              </tr>
            </>
          )}
        </tbody>
        {editing && (
          <tfoot>
            <tr>
              <td colSpan={PERSONS.length + 2}>
                <button type="button" className="add-row" onClick={addRow}>
                  + 항목 추가
                </button>
                <datalist id="asset-kinds">
                  {unusedKinds().map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      <p className="muted assets-note">2025년 8월부터 다시 모으는 중</p>

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
