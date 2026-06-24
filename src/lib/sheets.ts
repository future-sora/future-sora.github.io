import { getValidToken } from './googleAuth'
import { SPREADSHEET_ID } from '../config'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getValidToken()
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

function httpError(action: string, status: number): Error {
  if (status === 403) return new Error(`${action}: 권한 없음(시트 공유/스코프 확인)`)
  if (status === 401) return new Error(`${action}: 인증 만료(다시 로그인 필요)`)
  return new Error(`${action}: HTTP ${status}`)
}

/** T3 검증용: 시트 메타 제목을 읽어 접근 확인. */
export async function pingSpreadsheet(): Promise<{
  ok: boolean
  title?: string
  error?: string
}> {
  try {
    const r = await authedFetch(`${BASE}/${SPREADSHEET_ID}?fields=properties.title`)
    if (!r.ok) return { ok: false, error: httpError('시트 접근', r.status).message }
    const j = (await r.json()) as { properties?: { title?: string } }
    return { ok: true, title: j.properties?.title }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getSheetMeta(): Promise<
  { title: string; sheetId: number }[]
> {
  const r = await authedFetch(
    `${BASE}/${SPREADSHEET_ID}?fields=sheets.properties(title,sheetId)`,
  )
  if (!r.ok) throw httpError('메타 조회', r.status)
  const j = (await r.json()) as {
    sheets?: { properties: { title: string; sheetId: number } }[]
  }
  return (j.sheets ?? []).map((s) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }))
}

export async function getValues(range: string): Promise<string[][]> {
  const r = await authedFetch(
    `${BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
  )
  if (!r.ok) throw httpError(`읽기(${range})`, r.status)
  const j = (await r.json()) as { values?: string[][] }
  return j.values ?? []
}

export async function appendRow(
  range: string,
  values: (string | number)[],
): Promise<void> {
  const r = await authedFetch(
    `${BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(
      range,
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [values] }) },
  )
  if (!r.ok) throw httpError(`추가(${range})`, r.status)
}

export async function updateValues(
  range: string,
  values: (string | number)[][],
): Promise<void> {
  const r = await authedFetch(
    `${BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values }) },
  )
  if (!r.ok) throw httpError(`수정(${range})`, r.status)
}

export async function batchUpdate(requests: unknown[]): Promise<void> {
  const r = await authedFetch(`${BASE}/${SPREADSHEET_ID}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  })
  if (!r.ok) throw httpError('batchUpdate', r.status)
}
