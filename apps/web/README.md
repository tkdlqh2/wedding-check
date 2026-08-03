# 웨딩체크 — apps/web

웨딩홀 스캔 오퍼레이터 인수인계 시스템. Next.js 16 App Router + Drizzle + Neon(pgvector).

## 빠른 시작

```bash
npm ci
cp .env.local.example .env.local   # 값 채우기
npm run dev                        # http://localhost:3000
```

로컬 DB 준비, 마이그레이션, 계정 발급, 배포, 장애 대응은 **[운영 문서](../../docs/operations.md)** 를 본다.

## 스크립트

| 명령 | 용도 |
|---|---|
| `npm run dev` / `build` / `start` | 개발 / 빌드 / 프로덕션 실행 |
| `npm test` | 전체 테스트(DB 통합 테스트 포함 — `.env.test` 필요) |
| `npm run lint` | ESLint |
| `npm run seed` | 최초 관리자·오퍼레이터 계정 발급(1회) |
| `npm run db:test:migrate` | 테스트 DB에 마이그레이션 적용 |

## 문서

- [운영 문서](../../docs/operations.md) — 배포·환경변수·크론·장애 대응
- [DESIGN.md](../../DESIGN.md) — 브랜드/UI 규칙 (UI 작업 전 필독)
- `_bmad-output/planning-artifacts/` — PRD, 아키텍처, 에픽
- `_bmad-output/implementation-artifacts/deferred-work.md` — 알려진 한계
