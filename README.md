# kakebu (家計簿)

공동 가계부 웹앱. 프론트엔드 단독(서버 없음)이며 데이터는 구글 시트에 저장한다.

**라이브: https://future-sora.github.io**

## 기능
- 월별 수입·지출 입력 + 사람별/합계 자동 집계(소비총액·저축가능액·최종저축)
- 대시보드: 월별 저축 추이·저축률·항목별 지출 차트
- 자산 현황 + 다중 목표 진행률
- 정규화 CSV 가져오기

## 스택
React + Vite + TypeScript · 차트 recharts · 저장소 Google Sheets API (GIS OAuth, token model)

## 개발
```
npm install
npm run dev      # 로컬 개발 서버 (localhost:5173)
npm test         # 단위 테스트 (vitest)
npm run build    # 타입체크 + 프로덕션 빌드
npm run lint     # oxlint
```

## 배포
`main` 푸시 시 GitHub Actions가 GitHub Pages로 자동 배포한다 (`.github/workflows/deploy.yml`).

## 인증·데이터
- 구글 OAuth(GIS)로 로그인한 계정 권한으로 비공개 시트를 읽고 쓴다.
- 앱은 시트에 `ledger` / `assets` / `goals` 탭이 없으면 자동 생성한다.
- 스키마 설계는 `.claude/docs/data-schema.md` 참조.
- 민감 데이터는 시트에만 있으며 코드·레포에는 포함하지 않는다.
```
