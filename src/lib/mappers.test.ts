import { describe, it, expect } from 'vitest'
import {
  ledgerToRow,
  rowToLedger,
  assetToRow,
  rowToAsset,
  goalToRow,
  rowToGoal,
  parseRows,
  LEDGER_HEADER,
} from './mappers'
import type { LedgerEntry, AssetEntry, Goal } from '../domain/types'

describe('ledger round-trip', () => {
  it('객체→행→객체가 보존된다', () => {
    const e: LedgerEntry = {
      id: 'x1',
      month: '2026-06',
      person: '소라삐',
      type: '소비',
      item: '용돈',
      amount: 70,
    }
    const back = rowToLedger((ledgerToRow(e) as string[]).map(String))
    expect(back).toEqual(e)
  })

  it('소수 금액 보존', () => {
    const e: LedgerEntry = {
      id: 'x2', month: '2026-06', person: '민달팽이', type: '소비', item: '넷플릭스', amount: 1.5,
    }
    expect(rowToLedger((ledgerToRow(e) as string[]).map(String))).toEqual(e)
  })
})

describe('rowToLedger 검증', () => {
  it('잘못된 month는 null', () => {
    expect(rowToLedger(['id', '2026/06', '소라삐', '소득', '월급', '490'])).toBeNull()
  })
  it('알 수 없는 person은 null', () => {
    expect(rowToLedger(['id', '2026-06', '홍길동', '소득', '월급', '490'])).toBeNull()
  })
  it('잘못된 type은 null', () => {
    expect(rowToLedger(['id', '2026-06', '소라삐', '투자', '월급', '490'])).toBeNull()
  })
  it('숫자가 아닌 금액은 null', () => {
    expect(rowToLedger(['id', '2026-06', '소라삐', '소득', '월급', 'abc'])).toBeNull()
  })
  it('빈 항목명은 null', () => {
    expect(rowToLedger(['id', '2026-06', '소라삐', '소득', '', '490'])).toBeNull()
  })
})

describe('asset / goal round-trip', () => {
  it('asset 보존', () => {
    const a: AssetEntry = { id: 'a1', person: '소라삐', kind: '예적금', amount: 5000 }
    expect(rowToAsset((assetToRow(a) as string[]).map(String))).toEqual(a)
  })
  it('goal 보존', () => {
    const g: Goal = { id: 'g1', name: '2030 3억', targetAmount: 30000, targetDate: '2030-10' }
    expect(rowToGoal((goalToRow(g) as string[]).map(String))).toEqual(g)
  })
  it('goal 잘못된 날짜는 null', () => {
    expect(rowToGoal(['g1', '목표', '30000', '2030'])).toBeNull()
  })
})

describe('parseRows', () => {
  it('헤더를 건너뛰고 유효 행만 파싱', () => {
    const rows = [
      LEDGER_HEADER,
      ['i1', '2026-06', '소라삐', '소득', '월급', '490'],
      ['i2', 'bad', '소라삐', '소비', '용돈', '70'], // 무효
      ['i3', '2026-06', '민달팽이', '소비', '생활비', '50'],
    ]
    const parsed = parseRows(rows, rowToLedger)
    expect(parsed).toHaveLength(2)
    expect(parsed.map((e) => e.id)).toEqual(['i1', 'i3'])
  })
})
