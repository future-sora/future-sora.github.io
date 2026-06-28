import type { Person } from '../config'

export type EntryType = '소득' | '소비'

export interface LedgerEntry {
  id: string
  month: string // YYYY-MM
  person: Person
  type: EntryType
  item: string
  amount: number // 만원
}

export interface AssetEntry {
  id: string
  person: Person
  kind: string
  amount: number // 만원
}

export interface Goal {
  id: string
  kind: string // 저축 종류(자산 종류 중 선택). 진행률 대상.
  targetAmount: number // 만원
  targetDate: string // YYYY-MM
}

export interface RateEntry {
  person: Person
  rate: number // ISA 평가 수익률(%). 손실이면 음수.
}
