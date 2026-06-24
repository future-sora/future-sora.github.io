import { PERSONS, type Person } from '../config'
import type { LedgerEntry, AssetEntry, Goal, EntryType } from '../domain/types'

export const LEDGER_HEADER = ['id', 'month', 'person', 'type', 'item', 'amount']
export const ASSETS_HEADER = ['id', 'person', 'kind', 'amount']
export const GOALS_HEADER = ['id', 'name', 'target_amount', 'target_date']

const isPerson = (v: string): v is Person =>
  (PERSONS as readonly string[]).includes(v)
const isType = (v: string): v is EntryType => v === '소득' || v === '소비'
const isMonth = (v: string): boolean => /^\d{4}-\d{2}$/.test(v)

// --- ledger ---
export function ledgerToRow(e: LedgerEntry): (string | number)[] {
  return [e.id, e.month, e.person, e.type, e.item, e.amount]
}

export function rowToLedger(row: string[]): LedgerEntry | null {
  const [id, month, person, type, item, amountRaw] = row
  if (!id || !item || !isMonth(month) || !isPerson(person) || !isType(type)) {
    return null
  }
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount)) return null
  return { id, month, person, type, item, amount }
}

// --- assets ---
export function assetToRow(a: AssetEntry): (string | number)[] {
  return [a.id, a.person, a.kind, a.amount]
}

export function rowToAsset(row: string[]): AssetEntry | null {
  const [id, person, kind, amountRaw] = row
  if (!id || !kind || !isPerson(person)) return null
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount)) return null
  return { id, person, kind, amount }
}

// --- goals ---
export function goalToRow(g: Goal): (string | number)[] {
  return [g.id, g.name, g.targetAmount, g.targetDate]
}

export function rowToGoal(row: string[]): Goal | null {
  const [id, name, targetRaw, targetDate] = row
  if (!id || !name || !isMonth(targetDate)) return null
  const targetAmount = Number(targetRaw)
  if (!Number.isFinite(targetAmount)) return null
  return { id, name, targetAmount, targetDate }
}

/** 헤더 행을 제외하고 유효한 행만 파싱. (헤더는 첫 행으로 가정) */
export function parseRows<T>(
  rows: string[][],
  rowTo: (row: string[]) => T | null,
): T[] {
  const out: T[] = []
  for (let i = 1; i < rows.length; i++) {
    const parsed = rowTo(rows[i])
    if (parsed) out.push(parsed)
  }
  return out
}
