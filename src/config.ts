// OAuth client id는 공개값(프론트에 임베드 무방, client secret 없음 — token model)
export const GOOGLE_CLIENT_ID =
  '103375162724-34nad54s1fd7mkv18reoj7q0mv1ubntt.apps.googleusercontent.com'

// 앱 데이터 저장 시트(앱 전용). 기존 가계부(1z8…)는 import 원본으로 별도.
export const SPREADSHEET_ID = '1mqwOfMmS-sG1sCPB5Qzo1qqQTBcjSRCcqhCCTmJlH2g'

// 시트 읽기/쓰기(민감) + 이메일 매핑용 비민감 스코프
export const SCOPES =
  'openid email profile https://www.googleapis.com/auth/spreadsheets'

export const PERSONS = ['소라삐', '민달팽이'] as const
export type Person = (typeof PERSONS)[number]

// 로그인 이메일 → person 자동 매핑(이메일 받으면 채움). 없으면 사용자가 직접 선택.
export const PERSON_BY_EMAIL: Record<string, Person> = {
  // 'sora@example.com': '소라삐',
  // 'mindal@example.com': '민달팽이',
}
