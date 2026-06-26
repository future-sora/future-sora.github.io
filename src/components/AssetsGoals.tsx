import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useData } from '../data/DataContext'
import { PERSONS, type Person } from '../config'
import type { AssetEntry, Goal, LedgerEntry } from '../domain/types'
import { goalProgress, summarizeMonth, listMonths } from '../domain/aggregate'
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

interface GoalForm {
  editId: string | null
  name: string
  targetAmount: string
  targetDate: string
}

const ISA_KIND = 'ISA (원금,저축)'
const ISA_START = '2025-08' // 이 달부터의 누적 저축가능액을 ISA(원금,저축)으로 본다

/** 2025-08 이후 각 사람의 누적 저축가능액(소득−소비). ISA(원금,저축) 자동값. */
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

export function AssetsGoals() {
  const { assets, goals, ledger, rewriteAssets, goalOps } = useData()
  const kinds = useMemo(() => kindSuggestions(assets), [assets])
  const isa = useMemo(() => isaSavings(ledger), [ledger])
  // 합계·총액은 파생 ISA를 포함(시트에 남은 ISA(원금,저축) 수동값은 제외).
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
    // 변경 없는 셀은 기존 id를 재사용. 순서·삭제·이름변경이 자연히 반영된다.
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

  // --- 목표 ---
  const emptyGoal = (): GoalForm => ({
    editId: null,
    name: '',
    targetAmount: '',
    targetDate: currentMonth(),
  })
  const [gf, setGf] = useState<GoalForm>(emptyGoal)
  const [gerr, setGerr] = useState<string | null>(null)
  const [gbusy, setGbusy] = useState(false)

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
    setGbusy(true)
    try {
      if (gf.editId) await goalOps.update(goal)
      else await goalOps.add(goal)
      setGf(emptyGoal())
      setGerr(null)
    } catch {
      setGerr('저장에 실패했습니다.')
    } finally {
      setGbusy(false)
    }
  }

  return (
    <section>
      <LoadingOverlay show={busy || gbusy} />
      <div className="monthly-top">
        <h3>자산 (총 {fmtMoney(total)} 만원)</h3>
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
      <p className="muted assets-note">2025년 8월부터 다시 모으는 중</p>
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
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={PERSONS.length + 1} className="muted">
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
                    <button
                      type="button"
                      className="row-btn row-del"
                      title="삭제"
                      onClick={() => removeRow(row.id)}
                    >
                      ✕
                    </button>
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
            </tr>
          ))}
          {!editing && rows.length > 0 && (
            <tr className="total">
              <td>합계</td>
              {PERSONS.map((p) => (
                <td key={p} className="num">
                  {fmtMoney(byPerson[p])}
                </td>
              ))}
            </tr>
          )}
        </tbody>
        {editing && (
          <tfoot>
            <tr>
              <td colSpan={PERSONS.length + 1}>
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
        <button type="submit" disabled={gbusy}>
          {gf.editId ? '수정' : '추가'}
        </button>
        {gf.editId && (
          <button type="button" disabled={gbusy} onClick={() => setGf(emptyGoal())}>
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
                  disabled={gbusy}
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
                <button type="button" disabled={gbusy} onClick={() => goalOps.remove(g.id)}>
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
