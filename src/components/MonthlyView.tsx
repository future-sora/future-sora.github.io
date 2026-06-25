import { useEffect, useMemo, useState } from 'react'
import { useData } from '../data/DataContext'
import { PERSONS, type Person } from '../config'
import type { EntryType, LedgerEntry } from '../domain/types'
import { summarizeMonth, previousMonthWithData } from '../domain/aggregate'
import { ITEM_PRESETS } from '../domain/categories'
import { newId, currentMonth, fmtMoney } from '../lib/util'

const TYPES: EntryType[] = ['소득', '소비']

interface EditRow {
  id: string // React key (세션 내 안정). 프리셋/기존 항목은 `type:item`, 추가 행은 uuid.
  item: string // 항목명(추가 행만 편집 가능)
  fixed: boolean // 프리셋 행이면 이름 고정
  amounts: Record<Person, string> // 사람별 입력 문자열(만원)
}

type Grid = Record<EntryType, EditRow[]>

function sumCell(
  entries: LedgerEntry[],
  month: string,
  type: EntryType,
  item: string,
  person: Person,
): number {
  return entries
    .filter(
      (e) =>
        e.month === month && e.type === type && e.item === item && e.person === person,
    )
    .reduce((s, e) => s + e.amount, 0)
}

/**
 * 해당 달·구분의 항목 행을 구성. 값이 있는 항목만 보여준다(빈 항목은 숨김).
 * prefillMonth가 있으면(새 달) 그 달의 항목·금액을 디폴트로 미리 채운다.
 * alwaysShow 항목은 값이 없어도 항상 행으로 보인다(예: 월급).
 */
function buildRows(
  type: EntryType,
  ledger: LedgerEntry[],
  month: string,
  prefillMonth: string | null,
  alwaysShow: string[] = [],
): EditRow[] {
  const monthItems = ledger
    .filter((e) => e.month === month && e.type === type)
    .map((e) => e.item)
  const prevItems = prefillMonth
    ? ledger.filter((e) => e.month === prefillMonth && e.type === type).map((e) => e.item)
    : []
  const order = ITEM_PRESETS[type]
  const rows: EditRow[] = []
  for (const item of [...new Set([...monthItems, ...prevItems, ...alwaysShow])]) {
    const amounts = Object.fromEntries(
      PERSONS.map((p) => {
        const saved = sumCell(ledger, month, type, item, p)
        if (saved > 0) return [p, fmtMoney(saved)]
        if (prefillMonth) {
          const prev = sumCell(ledger, prefillMonth, type, item, p)
          return [p, prev > 0 ? fmtMoney(prev) : '']
        }
        return [p, '']
      }),
    ) as Record<Person, string>
    // 빈 항목 숨김. 단 alwaysShow(월급 등)는 빈 채로도 표시.
    if (PERSONS.every((p) => amounts[p] === '') && !alwaysShow.includes(item)) continue
    rows.push({ id: `${type}:${item}`, item, fixed: true, amounts })
  }
  // 프리셋 순서 우선, 그 외 항목은 뒤(안정 정렬)
  rows.sort((a, b) => {
    const ia = order.indexOf(a.item)
    const ib = order.indexOf(b.item)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
  return rows
}

/** 입력 가능한 달이 비었으면 직전(최근) 달을 미리채움 원본으로 — 소득·소비 모두. */
function buildGrid(
  ledger: LedgerEntry[],
  month: string,
): { grid: Grid; prefilled: boolean } {
  const editable = month >= currentMonth()
  const isEmpty = !ledger.some((e) => e.month === month)
  const prefillMonth = editable && isEmpty ? previousMonthWithData(ledger, month) : null
  return {
    grid: {
      // 월급은 금액은 안 채우되(직접 입력), 입력 가능한 달엔 행을 항상 보이게.
      소득: buildRows('소득', ledger, month, null, editable ? ['월급'] : []),
      소비: buildRows('소비', ledger, month, prefillMonth),
    },
    prefilled: prefillMonth != null,
  }
}

function emptyRow(): EditRow {
  return {
    id: newId(),
    item: '',
    fixed: false,
    amounts: Object.fromEntries(PERSONS.map((p) => [p, ''])) as Record<Person, string>,
  }
}

/** "YYYY-MM"에 delta개월 더한 달. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function MonthlyView() {
  const { ledger, applyLedgerChanges } = useData()
  const [month, setMonth] = useState(currentMonth())
  const [grid, setGrid] = useState<Grid>(() => buildGrid(ledger, month).grid)
  const [dirty, setDirty] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 지난 달은 조회 전용, 이번달(및 이후)만 입력 가능.
  const editable = month >= currentMonth()

  // 시트 데이터(ledger) 또는 달이 바뀌면 표를 다시 구성(저장 후 재로드 포함).
  useEffect(() => {
    const { grid: g, prefilled } = buildGrid(ledger, month)
    setGrid(g)
    setDirty(prefilled) // 미리채운 초안은 바로 저장할 수 있게 dirty
    setFormError(null)
  }, [ledger, month])

  const summary = useMemo(() => summarizeMonth(ledger, month), [ledger, month])

  // 항목 추가 후보: 프리셋 + 지금껏 쓴 항목 중, 이 달 표에 아직 없는 것.
  const knownItems = useMemo(() => {
    const out = {} as Record<EntryType, string[]>
    for (const type of TYPES) {
      const used = ledger.filter((e) => e.type === type).map((e) => e.item)
      out[type] = [...new Set([...ITEM_PRESETS[type], ...used])]
    }
    return out
  }, [ledger])

  function unusedFor(type: EntryType): string[] {
    const inGrid = new Set(grid[type].map((r) => r.item.trim()).filter(Boolean))
    return knownItems[type].filter((i) => !inGrid.has(i))
  }

  function setAmount(type: EntryType, rowId: string, person: Person, value: string) {
    setGrid((g) => ({
      ...g,
      [type]: g[type].map((r) =>
        r.id === rowId ? { ...r, amounts: { ...r.amounts, [person]: value } } : r,
      ),
    }))
    setDirty(true)
  }

  function setName(type: EntryType, rowId: string, value: string) {
    setGrid((g) => ({
      ...g,
      [type]: g[type].map((r) => (r.id === rowId ? { ...r, item: value } : r)),
    }))
    setDirty(true)
  }

  function addRow(type: EntryType) {
    setGrid((g) => ({ ...g, [type]: [...g[type], emptyRow()] }))
    setDirty(true)
  }

  async function save() {
    // 현재 시트 상태를 셀 키(type|item|person)별로 모은다(중복 항목은 합산·id 누적).
    const original = new Map<string, { ids: string[]; amount: number }>()
    for (const e of ledger) {
      if (e.month !== month) continue
      const k = `${e.type}|${e.item}|${e.person}`
      const cur = original.get(k) ?? { ids: [], amount: 0 }
      cur.ids.push(e.id)
      cur.amount += e.amount
      original.set(k, cur)
    }

    const creates: LedgerEntry[] = []
    const updates: LedgerEntry[] = []
    const deletes: string[] = []
    const seen = new Set<string>()

    for (const type of TYPES) {
      for (const row of grid[type]) {
        const item = row.item.trim()
        if (!item) continue
        for (const p of PERSONS) {
          const k = `${type}|${item}|${p}`
          if (seen.has(k)) continue // 같은 키 중복 행이면 첫 행만 반영
          seen.add(k)
          const raw = row.amounts[p].trim()
          const v = Number(raw)
          if (raw !== '' && (!Number.isFinite(v) || v <= 0)) {
            setFormError(`금액은 0보다 큰 숫자여야 합니다. (${type} · ${item} · ${p})`)
            return
          }
          const orig = original.get(k)
          if (raw !== '' && v > 0) {
            if (orig) {
              if (!(orig.ids.length === 1 && orig.amount === v)) {
                updates.push({ id: orig.ids[0], month, person: p, type, item, amount: v })
                for (const extra of orig.ids.slice(1)) deletes.push(extra)
              }
            } else {
              creates.push({ id: newId(), month, person: p, type, item, amount: v })
            }
          } else if (orig) {
            for (const id of orig.ids) deletes.push(id)
          }
        }
      }
    }

    // 표에서 사라진 항목(행 삭제·이름 변경)은 시트에서 삭제
    for (const [k, orig] of original) {
      if (!seen.has(k)) for (const id of orig.ids) deletes.push(id)
    }

    if (creates.length === 0 && updates.length === 0 && deletes.length === 0) {
      setDirty(false)
      setFormError(null)
      return
    }

    setBusy(true)
    setFormError(null)
    try {
      await applyLedgerChanges({ creates, updates, deletes })
    } catch {
      setFormError('저장에 실패했습니다. 다시 시도하세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="monthly">
      <div className="monthly-top">
        <input
          className="month-picker"
          type="month"
          aria-label="월 선택"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <span className="monthly-actions">
          {editable ? (
            <button
              type="button"
              onClick={save}
              disabled={!dirty || busy}
              className="save-btn"
            >
              {busy ? '저장 중…' : '저장'}
            </button>
          ) : (
            <span className="muted readonly-tag">지난 달 · 조회 전용</span>
          )}
          <button
            type="button"
            className="next-month"
            onClick={() => setMonth(shiftMonth(month, 1))}
            title="다음 달로 이동해 입력"
          >
            다음 달 +
          </button>
        </span>
      </div>

      {formError && <p className="error">{formError}</p>}

      {TYPES.map((type) => (
        <div key={type} className="grid-block">
          <h3>{type}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>항목</th>
                {PERSONS.map((p) => (
                  <th key={p} className="num">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid[type].length === 0 && (
                <tr>
                  <td colSpan={PERSONS.length + 1} className="muted">
                    {editable ? '아래 + 로 항목을 추가하세요.' : '이 달은 데이터가 없습니다.'}
                  </td>
                </tr>
              )}
              {grid[type].map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.fixed || !editable ? (
                      row.item
                    ) : (
                      <input
                        className="item-input"
                        list={`cat-${type}`}
                        placeholder="항목 선택/입력"
                        value={row.item}
                        onChange={(e) => setName(type, row.id, e.target.value)}
                      />
                    )}
                  </td>
                  {PERSONS.map((p) => (
                    <td key={p} className="num">
                      {editable ? (
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          inputMode="decimal"
                          className="amount-input"
                          value={row.amounts[p]}
                          onChange={(e) => setAmount(type, row.id, p, e.target.value)}
                        />
                      ) : (
                        row.amounts[p]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {editable && (
              <tfoot>
                <tr>
                  <td colSpan={PERSONS.length + 1}>
                    <button
                      type="button"
                      className="add-row"
                      onClick={() => addRow(type)}
                    >
                      + 항목 추가
                    </button>
                    <datalist id={`cat-${type}`}>
                      {unusedFor(type).map((i) => (
                        <option key={i} value={i} />
                      ))}
                    </datalist>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ))}

      <div className="summary">
        <h3>{month} 집계 (만원)</h3>
        <table>
          <thead>
            <tr>
              <th></th>
              {PERSONS.map((p) => (
                <th key={p} className="num">
                  {p}
                </th>
              ))}
              <th className="num">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>소득</td>
              {PERSONS.map((p) => (
                <td key={p} className="num">
                  {fmtMoney(summary.byPerson[p].income)}
                </td>
              ))}
              <td className="num">{fmtMoney(summary.total.income)}</td>
            </tr>
            <tr>
              <td>소비</td>
              {PERSONS.map((p) => (
                <td key={p} className="num">
                  {fmtMoney(summary.byPerson[p].expense)}
                </td>
              ))}
              <td className="num">{fmtMoney(summary.total.expense)}</td>
            </tr>
            <tr className="total">
              <td>저축가능</td>
              {PERSONS.map((p) => (
                <td key={p} className="num">
                  {fmtMoney(summary.byPerson[p].savable)}
                </td>
              ))}
              <td className="num">{fmtMoney(summary.total.savable)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
