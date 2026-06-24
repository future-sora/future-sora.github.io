import { describe, it, expect } from 'vitest'
import { parseLedgerCsv } from './csv'

describe('parseLedgerCsv', () => {
  it('헤더 포함 유효 CSV를 파싱하고 id를 부여한다', () => {
    const csv = `month,person,type,item,amount
2026-06,소라삐,소득,월급,490
2026-06,민달팽이,소비,용돈,70`
    const r = parseLedgerCsv(csv)
    expect(r.valid).toHaveLength(2)
    expect(r.errors).toHaveLength(0)
    expect(r.valid[0]).toMatchObject({
      month: '2026-06',
      person: '소라삐',
      type: '소득',
      item: '월급',
      amount: 490,
    })
    expect(r.valid[0].id).toBeTruthy()
  })

  it('헤더 없이도 파싱한다', () => {
    const r = parseLedgerCsv('2026-06,소라삐,소비,생활비,100')
    expect(r.valid).toHaveLength(1)
    expect(r.valid[0].item).toBe('생활비')
  })

  it('형식 오류 행은 errors에 줄번호와 함께 모은다', () => {
    const csv = `2026-06,소라삐,소득,월급,490
bad,홍길동,xxx,월급,abc`
    const r = parseLedgerCsv(csv)
    expect(r.valid).toHaveLength(1)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].line).toBe(2)
  })

  it('컬럼이 부족하면 오류', () => {
    const r = parseLedgerCsv('2026-06,소라삐,소득')
    expect(r.valid).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
  })

  it('빈 입력은 빈 결과', () => {
    expect(parseLedgerCsv('   ').valid).toHaveLength(0)
  })
})
