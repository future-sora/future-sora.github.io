import type { LedgerEntry } from '../domain/types'
import { rowToLedger } from './mappers'
import { newId } from './util'

export interface ImportResult {
  valid: LedgerEntry[]
  errors: { line: number; reason: string }[]
}

const HEADER = 'month,person,type,item,amount'

/**
 * 정규화 CSV(month,person,type,item,amount) 파싱. id는 앱이 부여.
 * 첫 줄이 헤더면 건너뛴다. 형식 오류 행은 errors에 사유와 함께 모은다.
 * (가계부 값엔 쉼표가 없다고 가정한 단순 분리)
 */
export function parseLedgerCsv(text: string): ImportResult {
  const valid: LedgerEntry[] = []
  const errors: { line: number; reason: string }[] = []

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return { valid, errors }

  const firstNormalized = lines[0].toLowerCase().replace(/\s/g, '')
  const start = firstNormalized.startsWith(HEADER) ? 1 : 0

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim())
    if (cols.length < 5) {
      errors.push({ line: i + 1, reason: '컬럼 수 부족(5개 필요)' })
      continue
    }
    const [month, person, type, item, amount] = cols
    const entry = rowToLedger([newId(), month, person, type, item, amount])
    if (!entry) {
      errors.push({ line: i + 1, reason: `형식 오류: ${lines[i]}` })
      continue
    }
    valid.push(entry)
  }
  return { valid, errors }
}
