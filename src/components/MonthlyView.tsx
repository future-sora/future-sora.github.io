import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useData } from '../data/DataContext'
import { useAuth } from '../auth/AuthContext'
import { PERSONS, type Person } from '../config'
import type { EntryType, LedgerEntry } from '../domain/types'
import {
  summarizeMonth,
  listMonths,
  previousMonthWithData,
  carryForward,
} from '../domain/aggregate'
import { itemSuggestions } from '../domain/categories'
import { newId, currentMonth, fmtMoney } from '../lib/util'

interface FormState {
  editId: string | null
  person: Person
  type: EntryType
  item: string
  amount: string
}

export function MonthlyView() {
  const { ledger, ledgerOps, bulkAddLedger } = useData()
  const { person: myPerson } = useAuth()
  const [month, setMonth] = useState(currentMonth())
  const [form, setForm] = useState<FormState>({
    editId: null,
    person: myPerson ?? PERSONS[0],
    type: '소비',
    item: '',
    amount: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copySource, setCopySource] = useState('')
  const [copyBusy, setCopyBusy] = useState(false)

  const rows = useMemo(
    () => ledger.filter((e) => e.month === month),
    [ledger, month],
  )
  const summary = useMemo(() => summarizeMonth(ledger, month), [ledger, month])
  const suggestions = useMemo(
    () => itemSuggestions(form.type, ledger),
    [form.type, ledger],
  )

  // 복제 원본 후보: 데이터 있는 다른 달(내림차순). 기본값은 직전 달.
  const sourceMonths = useMemo(
    () => listMonths(ledger).filter((m) => m !== month),
    [ledger, month],
  )
  const defaultSource = useMemo(
    () => previousMonthWithData(ledger, month) ?? sourceMonths[0] ?? '',
    [ledger, month, sourceMonths],
  )
  const effectiveSource = copySource || defaultSource
  const copyCount = useMemo(
    () => ledger.filter((e) => e.month === effectiveSource).length,
    [ledger, effectiveSource],
  )

  // 달을 바꾸면 원본 선택을 기본값으로 되돌린다.
  useEffect(() => {
    setCopySource('')
  }, [month])

  async function createFromMonth() {
    if (!effectiveSource) return
    const entries = carryForward(ledger, effectiveSource, month, newId)
    if (entries.length === 0) return
    setCopyBusy(true)
    try {
      await bulkAddLedger(entries)
      setCopySource('')
    } catch {
      /* 에러는 상단 배너로 표시됨 */
    } finally {
      setCopyBusy(false)
    }
  }

  function resetForm() {
    setForm((f) => ({ ...f, editId: null, item: '', amount: '' }))
    setFormError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const item = form.item.trim()
    const amount = Number(form.amount)
    if (!item) {
      setFormError('항목을 입력하세요.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('금액은 0보다 큰 숫자여야 합니다.')
      return
    }
    const entry: LedgerEntry = {
      id: form.editId ?? newId(),
      month,
      person: form.person,
      type: form.type,
      item,
      amount,
    }
    setBusy(true)
    try {
      if (form.editId) await ledgerOps.update(entry)
      else await ledgerOps.add(entry)
      resetForm()
    } catch {
      setFormError('저장에 실패했습니다. 다시 시도하세요.')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(entry: LedgerEntry) {
    setForm({
      editId: entry.id,
      person: entry.person,
      type: entry.type,
      item: entry.item,
      amount: String(entry.amount),
    })
    setFormError(null)
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      await ledgerOps.remove(id)
      if (form.editId === id) resetForm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="monthly">
      <label className="month-picker">
        월{' '}
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>

      {rows.length === 0 && effectiveSource && (
        <div className="new-month">
          <span>
            {month}은 아직 비어 있어요. 지난 달 정기 항목을 복제해 시작하세요.
          </span>
          <span className="new-month-actions">
            <select
              value={effectiveSource}
              onChange={(e) => setCopySource(e.target.value)}
              disabled={copyBusy}
            >
              {sourceMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button type="button" onClick={createFromMonth} disabled={copyBusy}>
              {copyBusy ? '복제 중…' : `${effectiveSource} 항목 ${copyCount}개 복제`}
            </button>
          </span>
        </div>
      )}

      <form onSubmit={submit} className="entry-form">
        <select
          value={form.person}
          onChange={(e) => setForm({ ...form, person: e.target.value as Person })}
        >
          {PERSONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={form.type}
          onChange={(e) =>
            setForm({ ...form, type: e.target.value as EntryType })
          }
        >
          <option value="소득">소득</option>
          <option value="소비">소비</option>
        </select>
        <input
          list="item-suggestions"
          placeholder="항목"
          value={form.item}
          onChange={(e) => setForm({ ...form, item: e.target.value })}
        />
        <datalist id="item-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder="금액(만원)"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <button type="submit" disabled={busy}>
          {form.editId ? '수정' : '추가'}
        </button>
        {form.editId && (
          <button type="button" onClick={resetForm} disabled={busy}>
            취소
          </button>
        )}
      </form>
      {formError && <p className="error">{formError}</p>}

      <table className="ledger">
        <thead>
          <tr>
            <th>사람</th>
            <th>구분</th>
            <th>항목</th>
            <th>금액</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5}>이 달 입력이 없습니다.</td>
            </tr>
          )}
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{e.person}</td>
              <td>{e.type}</td>
              <td>{e.item}</td>
              <td className="num">{fmtMoney(e.amount)}</td>
              <td>
                <button type="button" onClick={() => startEdit(e)} disabled={busy}>
                  수정
                </button>
                <button type="button" onClick={() => remove(e.id)} disabled={busy}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="summary">
        <h3>{month} 집계 (만원)</h3>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>소득</th>
              <th>소비</th>
              <th>저축가능</th>
            </tr>
          </thead>
          <tbody>
            {PERSONS.map((p) => (
              <tr key={p}>
                <td>{p}</td>
                <td className="num">{fmtMoney(summary.byPerson[p].income)}</td>
                <td className="num">{fmtMoney(summary.byPerson[p].expense)}</td>
                <td className="num">{fmtMoney(summary.byPerson[p].savable)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>합계</td>
              <td className="num">{fmtMoney(summary.total.income)}</td>
              <td className="num">{fmtMoney(summary.total.expense)}</td>
              <td className="num">{fmtMoney(summary.total.savable)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
