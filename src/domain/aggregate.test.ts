import { describe, it, expect } from 'vitest'
import {
  summarizeMonth,
  savingsRate,
  listMonths,
  savingsTrend,
  expenseByItem,
  totalAssets,
  goalProgress,
  previousMonthWithData,
  carryForward,
} from './aggregate'
import type { LedgerEntry, AssetEntry, Goal } from './types'
import type { Person } from '../config'

let seq = 0
const e = (
  person: Person,
  type: '소득' | '소비',
  item: string,
  amount: number,
  month = '2026-06',
): LedgerEntry => ({ id: `e${seq++}`, month, person, type, item, amount })

describe('summarizeMonth', () => {
  it('사람별·합계 소득/소비/저축가능액을 계산한다', () => {
    const entries = [
      e('소라삐', '소득', '월급', 490),
      e('소라삐', '소비', '용돈', 70),
      e('소라삐', '소비', '생활비', 100),
      e('민달팽이', '소득', '월급', 460),
      e('민달팽이', '소비', '용돈', 70),
    ]
    const s = summarizeMonth(entries, '2026-06')
    expect(s.byPerson['소라삐']).toEqual({ income: 490, expense: 170, savable: 320 })
    expect(s.byPerson['민달팽이']).toEqual({ income: 460, expense: 70, savable: 390 })
    expect(s.total).toEqual({ income: 950, expense: 240, savable: 710 })
  })

  it('빈 달은 모두 0', () => {
    const s = summarizeMonth([], '2026-06')
    expect(s.total).toEqual({ income: 0, expense: 0, savable: 0 })
    expect(s.byPerson['소라삐']).toEqual({ income: 0, expense: 0, savable: 0 })
  })

  it('다른 달 항목은 제외한다', () => {
    const s = summarizeMonth([e('소라삐', '소득', '월급', 490, '2026-05')], '2026-06')
    expect(s.total.income).toBe(0)
  })

  it('소수 금액(만원 단위)도 정확히 합산', () => {
    const s = summarizeMonth(
      [e('소라삐', '소비', '넷플릭스', 1.5), e('소라삐', '소비', '정수기', 2.5)],
      '2026-06',
    )
    expect(s.byPerson['소라삐'].expense).toBe(4)
  })
})

describe('savingsRate', () => {
  it('저축률 = 저축가능액 / 소득합', () => {
    const s = summarizeMonth(
      [e('소라삐', '소득', '월급', 100), e('소라삐', '소비', '용돈', 40)],
      '2026-06',
    )
    expect(savingsRate(s)).toBeCloseTo(0.6)
  })

  it('소득이 0이면 0', () => {
    expect(savingsRate(summarizeMonth([], '2026-06'))).toBe(0)
  })
})

describe('listMonths / savingsTrend', () => {
  const entries = [
    e('소라삐', '소득', '월급', 100, '2026-04'),
    e('소라삐', '소비', '용돈', 30, '2026-04'),
    e('소라삐', '소득', '월급', 200, '2026-05'),
  ]

  it('listMonths는 내림차순 유니크', () => {
    expect(listMonths(entries)).toEqual(['2026-05', '2026-04'])
  })

  it('savingsTrend는 오름차순 월별 최종저축·소득·저축률', () => {
    expect(savingsTrend(entries)).toEqual([
      { month: '2026-04', savable: 70, income: 100, rate: 0.7 },
      { month: '2026-05', savable: 200, income: 200, rate: 1 },
    ])
  })
})

describe('expenseByItem', () => {
  it('항목별 지출 합계를 내림차순으로', () => {
    const entries = [
      e('소라삐', '소비', '용돈', 70),
      e('민달팽이', '소비', '용돈', 70),
      e('소라삐', '소비', '생활비', 100),
      e('소라삐', '소득', '월급', 490), // 소득은 제외
    ]
    expect(expenseByItem(entries, '2026-06')).toEqual([
      { item: '용돈', amount: 140 },
      { item: '생활비', amount: 100 },
    ])
  })
})

describe('totalAssets / goalProgress', () => {
  const assets: AssetEntry[] = [
    { id: 'a1', person: '소라삐', kind: '예적금', amount: 5000 },
    { id: 'a2', person: '민달팽이', kind: '주식', amount: 160 },
  ]

  it('자산 총합', () => {
    expect(totalAssets(assets)).toBe(5160)
  })

  it('목표 진행률 = 현재 / 목표', () => {
    const goal: Goal = { id: 'g1', name: '2030 3억', targetAmount: 30000, targetDate: '2030-10' }
    expect(goalProgress(goal, 15000)).toBeCloseTo(0.5)
  })

  it('목표액 0이면 0', () => {
    const goal: Goal = { id: 'g0', name: 'x', targetAmount: 0, targetDate: '2030-10' }
    expect(goalProgress(goal, 100)).toBe(0)
  })
})

describe('previousMonthWithData', () => {
  const entries = [
    e('소라삐', '소득', '월급', 100, '2026-04'),
    e('소라삐', '소득', '월급', 200, '2026-06'),
  ]

  it('target 직전에 데이터 있는 가장 가까운 월', () => {
    expect(previousMonthWithData(entries, '2026-07')).toBe('2026-06')
    expect(previousMonthWithData(entries, '2026-06')).toBe('2026-04')
  })

  it('직전 데이터 없으면 null (target 이전이 비었을 때)', () => {
    expect(previousMonthWithData(entries, '2026-04')).toBeNull()
    expect(previousMonthWithData([], '2026-06')).toBeNull()
  })
})

describe('carryForward', () => {
  it('source 달 항목을 target 달로 복제하고 새 id를 부여한다', () => {
    let n = 0
    const idFn = () => `new${n++}`
    const entries = [
      e('소라삐', '소득', '월급', 490, '2026-05'),
      e('소라삐', '소비', '핸드폰요금', 5, '2026-05'),
      e('민달팽이', '소비', '용돈', 70, '2026-06'), // 다른 달 → 제외
    ]
    const out = carryForward(entries, '2026-05', '2026-06', idFn)
    expect(out).toEqual([
      { id: 'new0', month: '2026-06', person: '소라삐', type: '소득', item: '월급', amount: 490 },
      { id: 'new1', month: '2026-06', person: '소라삐', type: '소비', item: '핸드폰요금', amount: 5 },
    ])
  })

  it('source 달이 비면 빈 배열', () => {
    expect(carryForward([], '2026-05', '2026-06', () => 'x')).toEqual([])
  })
})
