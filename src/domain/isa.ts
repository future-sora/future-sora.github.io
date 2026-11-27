import { PERSONS, type Person } from '../config'
import type { AssetEntry, LedgerEntry } from './types'
import { listMonths, summarizeMonth } from './aggregate'

export const ISA_KIND = 'ISA (원금,저축)'
const ISA_START = '2025-08' // 이 달부터의 누적 저축가능액을 ISA(원금,저축)으로 본다

/** 2025-08 이후 각 사람의 누적 저축가능액(소득−소비). ISA(원금,저축) 자동값(원금). */
export function isaSavings(ledger: LedgerEntry[]): Record<Person, number> {
  const out = Object.fromEntries(PERSONS.map((p) => [p, 0])) as Record<Person, number>
  for (const m of listMonths(ledger)) {
    if (m < ISA_START) continue
    const s = summarizeMonth(ledger, m)
    // 저축가능액이 음수인 달은 0으로 본다(그 달은 저축 안 한 것).
    for (const p of PERSONS) out[p] += Math.max(0, s.byPerson[p].savable)
  }
  return out
}

export function sumAsset(assets: AssetEntry[], kind: string, person: Person): number {
  return assets
    .filter((a) => a.kind === kind && a.person === person)
    .reduce((s, a) => s + a.amount, 0)
}
