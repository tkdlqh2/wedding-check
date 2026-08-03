# 운영 문서 — 웨딩체크

배포·운영·장애 대응 절차. 코드 구조는 `_bmad-output/planning-artifacts/architecture/`를, 브랜드/UI 규칙은 `DESIGN.md`를 본다.

- 앱: `apps/web` (Next.js 16 App Router, TypeScript)
- 배포: Vercel
- DB: Neon Postgres + pgvector
- AI: OpenAI 단일 키(구조화 + 임베딩 + 음성 전사)

---

## 1. 환경변수

전부 `apps/web/.env.local.example`에 주석과 함께 있다. 프로덕션은 Vercel 프로젝트 환경변수에 등록한다.

| 변수 | 필수 | 비워두면 |
|---|---|---|
| `DATABASE_URL` | ✅ | 앱이 뜨지 않음 |
| `BETTER_AUTH_SECRET` | ✅ | 세션 서명 불가. `openssl rand -hex 32`로 생성 |
| `BETTER_AUTH_URL` | ✅ | 프로덕션 도메인 |
| `OPENAI_API_KEY` | ✅ | **AI 기능 전부 502** — 구조화·질의·음성 입력 |
| `CRON_SECRET` | ✅ | 인사이트 배치가 503으로 거부(fail closed) |
| `BLOB_READ_WRITE_TOKEN` | — | 영상 업로드가 로컬 파일시스템(`.local-blob/`) 폴백. **프로덕션에서는 반드시 채운다** |
| `SEED_*` 4종 | 시드 시 | 시드 스크립트가 에러로 중단 |

`SEED_*`는 초기 계정 발급에만 쓰인다. 계정이 생긴 뒤에는 관리자 화면(회원 관리)에서 만든다.

---

## 2. 최초 배포

1. **Neon 프로비저닝** — Vercel Marketplace 경유. Preview/Production 브랜치를 분리한다(AD-10).
2. **Vercel Blob store 생성** → `BLOB_READ_WRITE_TOKEN` 등록.
3. **환경변수 등록** — 위 표 전부.
4. **마이그레이션 적용** (아래 3절).
5. **배포** — `main` 푸시 시 자동.
6. **초기 계정 발급** (아래 4절).
7. **확인** — 관리자로 로그인 → 홀 등록 → 체크리스트 템플릿 등록 → 예식 등록.

---

## 3. DB 마이그레이션

마이그레이션 파일은 `apps/web/drizzle/*.sql`, 번호순으로 전부 적용된다.

```bash
cd apps/web
npx tsx scripts/apply-migrations.ts "<DATABASE_URL>"
```

- **적용 순서를 지켜야 한다.** 스크립트가 `0000`부터 순서대로 돌린다.
- **새 마이그레이션은 배포 전에 적용한다.** 스키마가 없는 상태로 새 코드가 뜨면 런타임 오류가 난다.
- pgvector 확장이 필요하다(Neon은 마이그레이션 `0000`에서 `CREATE EXTENSION`).

CI(`.github/workflows/ci.yml`)는 매 PR마다 빈 DB에 전체 체인을 적용해 검증한다 — 마이그레이션이 깨지면 CI가 먼저 잡는다.

---

## 4. 계정 발급

로그인 식별자는 **이메일이 아니라 전화번호**다(better-auth `phoneNumber` 플러그인). 이메일 컬럼은 better-auth 코어가 요구해서 있을 뿐 로그인에 쓰이지 않는다.

**최초 1회** — 관리자 계정이 하나도 없을 때만:

```bash
cd apps/web
npm run seed          # SEED_* 4개 환경변수 필요
```

**그 이후** — 관리자 화면 `/admin/members`에서 생성·역할 변경·비활성화한다. 시드 스크립트를 다시 돌릴 필요 없다.

역할은 두 가지뿐이다(AD-3): `admin`(홀/템플릿/예식 CRUD + 인사이트), `operator`(체크리스트 열람 + 질의 + 피드백).

---

## 5. 인사이트 배치 (크론)

반복 패턴 클러스터링(FR-10)은 실시간이 아니라 하루 1회 배치다.

- 스케줄: `apps/web/vercel.json`의 `crons` — `0 20 * * *` **UTC** = **한국시간 05:00**
- 엔드포인트: `GET /api/cron/insight-recompute`
- 인증: `Authorization: Bearer $CRON_SECRET` (Vercel Cron이 자동으로 붙임)

**수동 실행:**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/cron/insight-recompute
```

**응답 해석:**

| 코드 | 뜻 |
|---|---|
| `200` | 정상 완료 |
| `401` | 시크릿 불일치 |
| `409` | 이미 실행 중(동시 실행 방지 락) — 정상 동작이다 |
| `503` | `CRON_SECRET` 미설정 |

**배치가 실패해도 알림이 가지 않는다.** 구조화 로그(`insight_recompute_failed`)만 남는다. 인사이트 화면의 "마지막 갱신" 시각이 며칠째 그대로면 Vercel 로그를 확인한다.

---

## 6. 로그 보는 법

Vercel 함수 로그에 JSON 한 줄로 남는다. 검색할 이벤트 이름:

| 이벤트 | 뜻 |
|---|---|
| `query_no_match` | 질의에 매칭된 사례가 없음. `topSimilarity` 포함 — 임계값 재보정의 근거 |
| `query_failed` | 질의 실패(임베딩 API 오류 등) |
| `transcribe_failed` | 음성 인식 실패 |
| `insight_recompute_done` / `_failed` | 배치 결과 |

**로그에 피드백 원문·질의 텍스트·발화 내용은 없다**(NFR-5). 오류도 종류와 Postgres SQLSTATE만 남기고 메시지는 버린다(`lib/safe-error.ts`) — 원문이 오류 메시지를 타고 새어나가는 걸 막기 위해서다. 그래서 "왜 실패했는지"는 OpenAI/Neon 콘솔을 함께 봐야 알 수 있다.

---

## 7. 흔한 장애와 대응

**AI 기능만 전부 안 됨 (질의·구조화·음성)**
→ `OPENAI_API_KEY` 만료/한도 확인. 체크리스트 조회와 체크는 영향받지 않는다(AD-5) — 예식 진행 자체는 막히지 않는다.

**질의가 계속 "관련 사례 없음"**
→ 장애가 아닐 가능성이 높다. 확정된 피드백이 쌓여야 검색된다. `query_no_match` 로그의 `topSimilarity`가 0.42(`lib/services/query.ts::MIN_SIMILARITY`)에 계속 못 미치면 임계값 재보정 대상이다.

**영상이 업로드되는데 재생이 안 됨**
→ 프로덕션에서 `BLOB_READ_WRITE_TOKEN`이 비어 있으면 로컬 파일시스템 폴백으로 저장된다. 서버리스에서는 그 파일이 다음 요청에 남아 있지 않다. 토큰을 채우고 재업로드한다.

**인사이트가 며칠째 그대로**
→ 크론 실패. 5절 수동 실행으로 응답 코드를 확인한다.

**오퍼레이터가 관리자 화면에 들어가짐 / 못 들어감**
→ 역할은 `/admin/members`에서 즉시 바꿀 수 있다. 강등은 열려 있던 탭에서도 즉시 적용된다(페이지별 가드).

---

## 8. 로컬 개발

```bash
cd apps/web
npm ci
cp .env.local.example .env.local   # 값 채우기
npm run dev                        # http://localhost:3000
```

**로컬 DB(Docker):**

```bash
docker run -d --name wedding-check-db -p 5434:5432 \
  -e POSTGRES_USER=wedding_check -e POSTGRES_PASSWORD=wedding_check \
  -e POSTGRES_DB=wedding_check pgvector/pgvector:pg16
npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:5434/wedding_check"
```

**테스트** — DB 통합 테스트는 별도 DB(`wedding_check_test`)를 쓴다. `.env.test`에 연결 문자열을 넣고:

```bash
npm run db:test:migrate   # 스키마 적용
npm test                  # 전체
```

마이그레이션이 밀려 테이블 없음 오류가 나면 테스트 DB를 다시 만든다:

```bash
docker exec wedding-check-db psql -U wedding_check -d postgres -c "DROP DATABASE wedding_check_test;"
docker exec wedding-check-db psql -U wedding_check -d postgres -c "CREATE DATABASE wedding_check_test OWNER wedding_check;"
npm run db:test:migrate
```

**주의(Windows):** PowerShell 5.1의 `Set-Content -Encoding utf8`은 BOM을 붙인다. `.env` 파일에 쓰면 첫 번째 키가 깨진다 — `Out-File` 또는 편집기를 쓴다.

---

## 9. 알려진 한계

v1 범위에서 의도적으로 두고 온 것들. 상세는 `_bmad-output/implementation-artifacts/deferred-work.md`.

- **어휘가 완전히 다른 동의 표현은 검색되지 않는다.** "주례자가 순서를 바꿈" ≒ "목사님이 애드리브함"은 실측 유사도 0.277로, 무관한 질의보다도 낮다. 임계값을 낮추면 무관한 사례가 함께 들어온다. 하이브리드 검색이 필요하다.
- **인사이트 클러스터 재현율이 낮다.** 과병합(잘못된 근거 제시)을 막는 쪽으로 임계값을 잡았다 — 같은 원인인데 안 묶이는 경우가 있다.
- **배치 실패 알림 채널이 없다.**
- **인사이트 → 템플릿 자동 승격 없음.** 템플릿 반영은 사람이 판단한다.
- 임계값 두 개(`0.42` 질의 / `0.58` 클러스터)는 작은 표본의 실측값이다. 실데이터가 쌓이면 재보정 대상.
