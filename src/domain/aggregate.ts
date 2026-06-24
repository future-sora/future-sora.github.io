import { PERSONS, type Person } from '../config'
import type { LedgerEntry, AssetEntry, Goal } from './types'

export interface PersonSummary {
  income: number
  expense: number
  savable: number // 저축가능액 = income - expense
}

export interface MonthlySummary {
  month: string
  byPerson: Record<Person, PersonSummary>
  total: PersonSummary
}

function emptyPersonSummary(): PersonSummary {
  return { income: 0, expense: 0, savable: 0 }
}

/** 특정 월의 사람별·합계 소득/소비/저축가능액 집계 (만원). */
export function summarizeMonth(
  entries: LedgerEntry[],
  month: string,
): MonthlySummary {
  const byPerson = {} as Record<Person, PersonSummary>
  for (const p of PERSONS) byPerson[p] = emptyPersonSummary()

  for (const e of entries) {
    if (e.month !== month) continue
    const s = byPerson[e.person]
    if (!s) continue
    if (e.type === '소득') s.income += e.amount
    else s.expense += e.amount
  }

  const total = emptyPersonSummary()
  for (const p of PERSONS) {
    byPerson[p].savable = byPerson[p].income - byPerson[p].expense
    total.income += byPerson[p].income
    total.expense += byPerson[p].expense
  }
  total.savable = total.income - total.expense

  return { month, byPerson, total }
}

/** 저축률 = 저축가능액 / 소득합. 소득 0이면 0. */
export function savingsRate(summary: MonthlySummary): number {
  return summary.total.income === 0
    ? 0
    : summary.total.savable / summary.total.income
}

/** 데이터에 존재하는 월 목록(내림차순). */
export function listMonths(entries: LedgerEntry[]): string[] {
  return [...new Set(entries.map((e) => e.month))].sort().reverse()
}

/** 월별 최종저축(저축가능액 합) 추이 — 오름차순 월 순서. */
export function savingsTrend(
  entries: LedgerEntry[],
): { month: string; savable: number }[] {
  return [...new Set(entries.map((e) => e.month))]
    .sort()
    .map((month) => ({
      month,
      savable: summarizeMonth(entries, month).total.savable,
    }))
}

/** 카테고리(항목)별 지출 합계 — 내림차순. */
export function expenseByItem(
  entries: LedgerEntry[],
  month: string,
): { item: string; amount: number }[] {
  const map = new Map<string, number>()
  for (const e of entries) {
    if (e.month !== month || e.type !== '소비') continue
    map.set(e.item, (map.get(e.item) ?? 0) + e.amount)
  }
  return [...map.entries()]
    .map(([item, amount]) => ({ item, amount }))
    .sort((a, b) => b.amount - a.amount)
}

/** 자산 총합(만원). */
export function totalAssets(assets: AssetEntry[]): number {
  return assets.reduce((sum, a) => sum + a.amount, 0)
}

/** 목표 진행률 = 현재 자산총액 / 목표액 (0~1+, 목표 0이면 0). */
export function goalProgress(goal: Goal, currentTotal: number): number {
  return goal.targetAmount === 0 ? 0 : currentTotal / goal.targetAmount
}
