import type { LedgerEntry, AssetEntry, EntryType } from './types'

export const ITEM_PRESETS: Record<EntryType, string[]> = {
  소득: ['월급', '인센티브', '상여금', '근속장려금', '명절상여'],
  소비: [
    '용돈',
    '생활비',
    '핸드폰요금',
    '인터넷요금',
    '아파트관리비',
    '보험',
    '대출금이자',
    '구독료',
    '내일채움공제',
    '카드값',
    '정수기',
    '연금저축',
    '어머니비상금',
  ],
}

export const ASSET_KIND_PRESETS = [
  '예적금',
  '청약',
  '주식',
  '금',
  '퇴직금',
  'ISA',
  '우리사주',
  '청년채움공제',
  '월세보증금',
  '분담금',
  '예금',
]

/** 프리셋 + 기존 데이터에서 쓰인 항목을 합친 제안 목록(중복 제거). */
export function itemSuggestions(type: EntryType, ledger: LedgerEntry[]): string[] {
  const used = ledger.filter((e) => e.type === type).map((e) => e.item)
  return [...new Set([...ITEM_PRESETS[type], ...used])]
}

export function kindSuggestions(assets: AssetEntry[]): string[] {
  return [...new Set([...ASSET_KIND_PRESETS, ...assets.map((a) => a.kind)])]
}
