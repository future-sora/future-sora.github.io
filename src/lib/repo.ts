import {
  getSheetMeta,
  getValues,
  appendRow,
  appendRows,
  updateValues,
  batchUpdate,
} from './sheets'
import {
  LEDGER_HEADER,
  ASSETS_HEADER,
  GOALS_HEADER,
  ledgerToRow,
  rowToLedger,
  assetToRow,
  rowToAsset,
  goalToRow,
  rowToGoal,
  parseRows,
} from './mappers'
import type { LedgerEntry, AssetEntry, Goal } from '../domain/types'

const TABS = {
  ledger: { title: 'ledger', header: LEDGER_HEADER, range: 'ledger!A:F' },
  assets: { title: 'assets', header: ASSETS_HEADER, range: 'assets!A:D' },
  goals: { title: 'goals', header: GOALS_HEADER, range: 'goals!A:D' },
} as const

const sheetIdCache = new Map<string, number>()

/** 앱 탭이 없으면 생성하고 헤더를 채운다. 첫 로그인 후 1회 호출. */
export async function ensureTabs(): Promise<void> {
  const meta = await getSheetMeta()
  meta.forEach((m) => sheetIdCache.set(m.title, m.sheetId))
  const existing = new Set(meta.map((m) => m.title))

  const toCreate = Object.values(TABS).filter((t) => !existing.has(t.title))
  if (toCreate.length > 0) {
    await batchUpdate(
      toCreate.map((t) => ({ addSheet: { properties: { title: t.title } } })),
    )
    const meta2 = await getSheetMeta()
    meta2.forEach((m) => sheetIdCache.set(m.title, m.sheetId))
    for (const t of toCreate) {
      await updateValues(`${t.title}!A1`, [t.header])
    }
  } else {
    // 탭은 있으나 비어 있으면 헤더 보장
    for (const t of Object.values(TABS)) {
      const head = await getValues(`${t.title}!A1:1`)
      if (head.length === 0) await updateValues(`${t.title}!A1`, [t.header])
    }
  }
}

// --- load ---
export async function loadLedger(): Promise<LedgerEntry[]> {
  return parseRows(await getValues(TABS.ledger.range), rowToLedger)
}
export async function loadAssets(): Promise<AssetEntry[]> {
  return parseRows(await getValues(TABS.assets.range), rowToAsset)
}
export async function loadGoals(): Promise<Goal[]> {
  return parseRows(await getValues(TABS.goals.range), rowToGoal)
}

// --- helpers ---
/** id로 시트 행번호(1-based, 헤더=1)를 찾는다. */
async function findRowNumber(range: string, id: string): Promise<number | null> {
  const rows = await getValues(range)
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]?.[0] === id) return i + 1
  }
  return null
}

async function deleteRow(tabTitle: string, range: string, id: string): Promise<void> {
  const n = await findRowNumber(range, id)
  if (n == null) return
  let sheetId = sheetIdCache.get(tabTitle)
  if (sheetId == null) {
    ;(await getSheetMeta()).forEach((m) => sheetIdCache.set(m.title, m.sheetId))
    sheetId = sheetIdCache.get(tabTitle)
  }
  if (sheetId == null) throw new Error(`${tabTitle} 탭을 찾지 못했습니다.`)
  await batchUpdate([
    {
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: n - 1, endIndex: n },
      },
    },
  ])
}

// --- ledger CRUD ---
export async function addLedger(e: LedgerEntry): Promise<void> {
  await appendRow(TABS.ledger.range, ledgerToRow(e))
}
export async function importLedger(entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) return
  await appendRows(TABS.ledger.range, entries.map(ledgerToRow))
}
export async function updateLedger(e: LedgerEntry): Promise<void> {
  const n = await findRowNumber(TABS.ledger.range, e.id)
  if (n == null) throw new Error('수정 대상 행을 찾지 못했습니다.')
  await updateValues(`ledger!A${n}:F${n}`, [ledgerToRow(e)])
}
export async function deleteLedger(id: string): Promise<void> {
  await deleteRow(TABS.ledger.title, TABS.ledger.range, id)
}

// --- assets CRUD ---
export async function addAsset(a: AssetEntry): Promise<void> {
  await appendRow(TABS.assets.range, assetToRow(a))
}
export async function importAssets(entries: AssetEntry[]): Promise<void> {
  if (entries.length === 0) return
  await appendRows(TABS.assets.range, entries.map(assetToRow))
}
export async function updateAsset(a: AssetEntry): Promise<void> {
  const n = await findRowNumber(TABS.assets.range, a.id)
  if (n == null) throw new Error('수정 대상 행을 찾지 못했습니다.')
  await updateValues(`assets!A${n}:D${n}`, [assetToRow(a)])
}
export async function deleteAsset(id: string): Promise<void> {
  await deleteRow(TABS.assets.title, TABS.assets.range, id)
}

// --- goals CRUD ---
export async function addGoal(g: Goal): Promise<void> {
  await appendRow(TABS.goals.range, goalToRow(g))
}
export async function updateGoal(g: Goal): Promise<void> {
  const n = await findRowNumber(TABS.goals.range, g.id)
  if (n == null) throw new Error('수정 대상 행을 찾지 못했습니다.')
  await updateValues(`goals!A${n}:D${n}`, [goalToRow(g)])
}
export async function deleteGoal(id: string): Promise<void> {
  await deleteRow(TABS.goals.title, TABS.goals.range, id)
}
