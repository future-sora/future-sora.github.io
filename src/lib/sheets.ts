import { getValidToken } from './googleAuth'
import { SPREADSHEET_ID } from '../config'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

// T3 검증용: 시트 메타를 읽어 접근 가능 여부 확인. (T4에서 본격 데이터 레이어로 확장)
export async function pingSpreadsheet(): Promise<{
  ok: boolean
  title?: string
  error?: string
}> {
  try {
    const token = await getValidToken()
    const r = await fetch(
      `${API}/${SPREADSHEET_ID}?fields=properties.title`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!r.ok) {
      const detail = r.status === 403 ? '권한 없음(시트 공유/스코프 확인)' : `HTTP ${r.status}`
      return { ok: false, error: detail }
    }
    const j = (await r.json()) as { properties?: { title?: string } }
    return { ok: true, title: j.properties?.title }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
