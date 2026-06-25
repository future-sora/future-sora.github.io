import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useData } from '../data/DataContext'
import { PERSONS, type Person } from '../config'
import type { AssetEntry, Goal } from '../domain/types'
import { totalAssets, goalProgress } from '../domain/aggregate'
import { kindSuggestions, ASSET_KIND_PRESETS } from '../domain/categories'
import { newId, currentMonth, fmtMoney } from '../lib/util'

interface AssetRow {
  id: string // React key. 기존 종류는 `k:kind`, 추가 행은 uuid.
  kind: string // 자산 종류(추가 행만 편집 가능)
  fixed: boolean // 기존 종류면 이름 고정(라벨)
  amounts: Record<Person, string> // 사람별 입력 문자열(만원)
}

interface GoalForm {
  editId: string | null
  name: string
  targetAmount: string
  targetDate: string
}

function sumAsset(assets: AssetEntry[], kind: string, person: Person): number {
  return assets
    .filter((a) => a.kind === kind && a.person === person)
    .reduce((s, a) => s + a.amount, 0)
}

/** 자산을 종류(행)×사람(열) 매트릭스 행으로 구성. 프리셋 순서 우선. */
function buildAssetRows(assets: AssetEntry[]): AssetRow[] {
  const kinds = [...new Set(assets.map((a) => a.kind))]
  const rows: AssetRow[] = kinds.map((kind) => ({
    id: `k:${kind}`,
    kind,
    fixed: true,
    amounts: Object.fromEntries(
      PERSONS.map((p) => {
        const v = sumAsset(assets, kind, p)
        return [p, v > 0 ? fmtMoney(v) : '']
      }),
    ) as Record<Person, string>,
  }))
  rows.sort((a, b) => {
    const ia = ASSET_KIND_PRESETS.indexOf(a.kind)
    const ib = ASSET_KIND_PRESETS.indexOf(b.kind)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
  return rows
}

function emptyAssetRow(): AssetRow {
  return {
    id: newId(),
    kind: '',
    fixed: false,
    amounts: Object.fromEntries(PERSONS.map((p) => [p, ''])) as Record<Person, string>,
  }
}

export function AssetsGoals() {
  const { assets, goals, applyAssetChanges, goalOps } = useData()
  const total = useMemo(() => totalAssets(assets), [assets])
  const kinds = useMemo(() => kindSuggestions(assets), [assets])
  const byPerson = useMemo(
    () =>
      Object.fromEntries(
        PERSONS.map((p) => [p, assets.filter((a) => a.person === p).reduce((s, a) => s + a.amount, 0)]),
      ) as Record<Person, number>,
    [assets],
  )

  const [rows, setRows] = useState<AssetRow[]>(() => buildAssetRows(assets))
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [aerr, setAerr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // assets 변화 시 표 재구성(저장 후 재로드 포함). 편집 중 셀 변경은 setRows로만.
  useEffect(() => {
    setRows(buildAssetRows(assets))
    setDirty(false)
    setAerr(null)
  }, [assets])

  // 종류 추가 후보: 프리셋 + 기존 종류 중, 표에 아직 없는 것.
  function unusedKinds(): string[] {
    const inGrid = new Set(rows.map((r) => r.kind.trim()).filter(Boolean))
    return kinds.filter((k) => !inGrid.has(k))
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
  function cancel() {
    setEditing(false)
    setRows(buildAssetRows(assets))
    setDirty(false)
    setAerr(null)
  }

  async function save() {
    // 현재 시트 상태를 셀 키(kind|person)별로 모은다(중복은 합산·id 누적).
    const original = new Map<string, { ids: string[]; amount: number }>()
    for (const a of assets) {
      const k = `${a.kind}|${a.person}`
      const cur = original.get(k) ?? { ids: [], amount: 0 }
      cur.ids.push(a.id)
      cur.amount += a.amount
      original.set(k, cur)
    }

    const creates: AssetEntry[] = []
    const updates: AssetEntry[] = []
    const deletes: string[] = []
    const seen = new Set<string>()

    for (const row of rows) {
      const kind = row.kind.trim()
      if (!kind) continue
      for (const p of PERSONS) {
        const k = `${kind}|${p}`
        if (seen.has(k)) continue // 같은 종류 중복 행이면 첫 행만 반영
        seen.add(k)
        const raw = row.amounts[p].trim()
        const v = Number(raw)
        if (raw !== '' && (!Number.isFinite(v) || v <= 0)) {
          setAerr(`금액은 0보다 큰 숫자여야 합니다. (${kind} · ${p})`)
          return
        }
        const orig = original.get(k)
        if (raw !== '' && v > 0) {
          if (orig) {
            if (!(orig.ids.length === 1 && orig.amount === v)) {
              updates.push({ id: orig.ids[0], person: p, kind, amount: v })
              for (const extra of orig.ids.slice(1)) deletes.push(extra)
            }
          } else {
            creates.push({ id: newId(), person: p, kind, amount: v })
          }
        } else if (orig) {
          for (const id of orig.ids) deletes.push(id)
        }
      }
    }

    // 표에서 사라진 셀(행 삭제·종류 변경)은 시트에서 삭제
    for (const [k, orig] of original) {
      if (!seen.has(k)) for (const id of orig.ids) deletes.push(id)
    }

    if (creates.length === 0 && updates.length === 0 && deletes.length === 0) {
      setDirty(false)
      setAerr(null)
      setEditing(false)
      return
    }

    setBusy(true)
    setAerr(null)
    try {
      await applyAssetChanges({ creates, updates, deletes })
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
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                {!editing || row.fixed ? (
                  row.kind
                ) : (
                  <input
                    className="item-input"
                    list="asset-kinds"
                    placeholder="종류 선택/입력"
                    value={row.kind}
                    onChange={(e) => setKind(row.id, e.target.value)}
                  />
                )}
              </td>
              {PERSONS.map((p) => (
                <td key={p} className="num">
                  {editing ? (
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
