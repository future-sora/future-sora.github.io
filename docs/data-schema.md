# 데이터 스키마 (Google Sheets)

kakebu 웹앱의 저장소는 구글 시트 한 장이다. 앱은 OAuth(GIS, `spreadsheets` 스코프)로 이 시트를 읽고 쓴다.

- **spreadsheetId**(앱 저장소): `1mqwOfMmS-sG1sCPB5Qzo1qqQTBcjSRCcqhCCTmJlH2g` (앱 전용 새 시트)
- **import 원본**(기존 가계부): `1z8whZuXBerwPZU95ehyUA73DeayHmUruYnp5dUcrB68` (wide·메모·보기용 — 앱은 읽지 않음, CSV import만)
- 금액 단위: **만원** (정수 또는 소수 1자리, 예: `490`, `141.5`)
- 사람(person) 값: `소라삐` | `민달팽이` (닉네임 고정)
- 앱은 시작 시 아래 탭이 없으면 **헤더와 함께 자동 생성**한다(T3 OAuth 이후). 기존 보기용 표 탭은 건드리지 않는다.

---

## 탭 1: `ledger` (월별 수입·지출)

| 컬럼 | 키 | 타입 | 제약 / 예시 |
|---|---|---|---|
| A | `id` | string | 앱 생성 UUID. import 시 비어 있으면 앱이 부여 |
| B | `month` | string | `YYYY-MM` (예: `2026-06`) |
| C | `person` | enum | `소라삐` \| `민달팽이` |
| D | `type` | enum | `소득` \| `소비` |
| E | `item` | string | 항목명 (프리셋 또는 자유입력) |
| F | `amount` | number | 만원, 양수 |

- 행 추가는 `values.append`, 수정/삭제는 `id`로 대상 행을 찾아 처리.
- 집계(파생, 저장 안 함): `소비총액 = type=소비 합`, `저축가능액 = type=소득 합 − 소비총액`, `최종저축`(사람별·합계).

## 탭 2: `assets` (자산 현황)

| 컬럼 | 키 | 타입 | 제약 / 예시 |
|---|---|---|---|
| A | `id` | string | 앱 생성 UUID |
| B | `person` | enum | `소라삐` \| `민달팽이` |
| C | `kind` | string | 자산 종류 (프리셋 또는 자유입력) |
| D | `amount` | number | 만원 |

- 현재 시점 스냅샷. (추후 `asof` 컬럼으로 시점별 추이 확장 가능)

## 탭 3: `goals` (저축 목표)

| 컬럼 | 키 | 타입 | 제약 / 예시 |
|---|---|---|---|
| A | `id` | string | 앱 생성 UUID |
| B | `name` | string | 목표명 (예: `2030 분담금 3억`) |
| C | `target_amount` | number | 만원 (예: `30000`) |
| D | `target_date` | string | `YYYY-MM` (예: `2030-10`) |

- 진행률 = (대상 자산총액) / `target_amount`. MVP는 전체 자산총액 기준, 추후 목표별 대상 지정.

---

## 카테고리 프리셋 (FR-009)

코드 상수로 제공하고, 사용자가 추가 입력한 `item`/`kind`는 기존 데이터에서 distinct로 읽어 드롭다운에 합쳐 보여준다(별도 categories 탭 없음).

- **ledger 소득**: 월급, 인센티브, 상여금, 근속장려금, 명절상여
- **ledger 소비**: 용돈, 생활비, 핸드폰요금, 인터넷요금, 아파트관리비, 보험, 대출금이자, 구독료, 내일채움공제, 카드값, 정수기, 연금저축, 어머니비상금
- **assets kind**: 예적금, 청약, 주식, 금, 퇴직금, ISA, 우리사주, 청년채움공제, 월세보증금, 분담금, 예금

## 사람(person) 매핑 (FR-010)

로그인한 구글 계정 이메일 → person 닉네임 매핑(코드 설정). 입력 시 로그인 계정을 기본 person으로, 드롭다운으로 변경(대리 입력) 가능.

- `<소라 이메일>` → `소라삐`  *(T3에서 실제 이메일로 채움)*
- `<민달 이메일>` → `민달팽이`

## CSV import 포맷 (FR-006)

헤더: `month,person,type,item,amount` (id 제외 — 앱이 부여). 형식 오류 행은 거부하고 사유와 함께 보고.
