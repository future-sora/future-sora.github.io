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
  name: string
  targetAmount: number // 만원
  targetDate: string // YYYY-MM
}
