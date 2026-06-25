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

/** 월별 추이 — 최종저축·소득(만원)과 저축률(0~1). 오름차순 월 순서. */
export function savingsTrend(
  entries: LedgerEntry[],
): { month: string; savable: number; income: number; rate: number }[] {
  return [...new Set(entries.map((e) => e.month))]
    .sort()
    .map((month) => {
      const summary = summarizeMonth(entries, month)
      return {
        month,
        savable: summary.total.savable,
        income: summary.total.income,
        rate: savingsRate(summary),
      }
    })
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

/** targetMonth 직전에 데이터가 있는 가장 가까운 월. 없으면 null. */
export function previousMonthWithData(
  entries: LedgerEntry[],
  targetMonth: string,
): string | null {
  const months = [...new Set(entries.map((e) => e.month))]
    .filter((m) => m < targetMonth)
    .sort()
  return months.length > 0 ? months[months.length - 1] : null
}

/**
 * sourceMonth의 항목을 targetMonth로 복제(새 id 부여). 사람·구분·항목·금액 유지.
 * 매달 같은 정기 항목을 수동 재입력하지 않도록 "새 달 만들기"에 쓴다.
 */
export function carryForward(
  entries: LedgerEntry[],
  sourceMonth: string,
  targetMonth: string,
  idFn: () => string,
): LedgerEntry[] {
  return entries
    .filter((e) => e.month === sourceMonth)
    .map((e) => ({
      id: idFn(),
      month: targetMonth,
      person: e.person,
      type: e.type,
      item: e.item,
      amount: e.amount,
    }))
}
