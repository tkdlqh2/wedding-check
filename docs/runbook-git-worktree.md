# Runbook — 로컬 개발 환경 & git worktree 병행 개발

두 가지를 다룬다.

- **§2 처음 실행하기** — 레포를 받아서 로그인 화면까지 띄우는 최초 1회 절차(공유 개발 환경).
- **§3~§9 워크트리 병행 개발** — 스토리/픽스 하나를 별도 워크트리 + 전용 DB + 전용 포트로 착수해 병합·정리까지.

워크트리 쪽은 Epic 3~4에서 실제로 쓴 방식(`_bmad-output/implementation-artifacts/sprint-status.yaml`의 `git_pipeline` 노트)을 표준화한 것이며, 새 절차를 발명하지 않는다.

대상 환경: Windows 11 · Git Bash(기본) / PowerShell 5.1(보조) · Docker Desktop · Node 22 · `gh`.

---

## 1. 구성 한눈에

- 앱은 **`apps/web` 하나**다. 루트에 `package.json`이 없으므로 모든 npm 명령은 `apps/web`에서 실행한다.
- DB는 **로컬 Docker Postgres + pgvector**. 임베딩 검색(FR-6/7)과 인사이트 클러스터링(FR-10)이 `vector` 타입을 쓰므로 순정 `postgres` 이미지로는 마이그레이션이 실패한다.
- DB는 두 개다: 개발용 `wedding_check`, 테스트용 `wedding_check_test`(vitest가 매 테스트마다 전체 TRUNCATE 한다 — 개발 DB와 반드시 분리).
- 계정 생성 UI는 없다(v1 스코프 밖). **유일한 계정 프로비저닝 경로는 `npm run seed`**이고, 로그인 식별자는 **이메일이 아니라 전화번호**다.

| 환경 | 앱 포트 | DB 포트 | 컨테이너 |
|---|---|---|---|
| 공유 개발 환경(§2) | 3000 | 5434 | `wedding-check-db` |
| 워크트리(§3~) | 3013+ | 5436+ | `wedding-check-db-story<NN>` |

---

## 2. 처음 실행하기 (공유 개발 환경)

### 2-1. 사전 조건

```bash
node -v      # v22.x (CI와 동일 — .github/workflows/ci.yml)
docker ps    # 데몬 미기동이면 npipe:////./pipe/... 오류 → Docker Desktop 먼저 실행
```

### 2-2. 의존성 설치

```bash
cd /c/Users/tkdlq/IdeaProjects/wedding-check/apps/web
npm ci
```

### 2-3. `.env.local` 작성

```bash
cp .env.local.example .env.local
```

채워야 하는 값. **`SEED_*` 4개가 비어 있으면 시드 스크립트가 에러로 중단된다**(알려진 기본 비밀번호로 조용히 대체하지 않는다 — AD-10).

```dotenv
DATABASE_URL="postgresql://wedding_check:wedding_check@localhost:5434/wedding_check"

BETTER_AUTH_SECRET="<openssl rand -hex 32 결과>"
BETTER_AUTH_URL="http://localhost:3000"        # dev 포트와 반드시 일치

SEED_ADMIN_PASSWORD="..."
SEED_ADMIN_PHONE_NUMBER="01000000001"          # 하이픈 넣어도 됨 — 저장 시 숫자만 남는다
SEED_OPERATOR_PASSWORD="..."
SEED_OPERATOR_PHONE_NUMBER="01000000002"
```

시크릿 생성은 Git Bash에 포함된 openssl로:

```bash
openssl rand -hex 32
```

**선택 키** — 비워두면 해당 기능만 못 쓰고 나머지는 정상 동작한다. 예시 파일 주석에 각각의 동작이 설명돼 있다.

| 키 | 비워두면 |
|---|---|
| `OPENAI_API_KEY` | 자연어 질의·피드백 구조화·인사이트 라벨이 **실패로 즉시 노출**된다(조용히 넘어가지 않음 — AD-5). 체크리스트/예식 흐름은 정상 |
| `BLOB_READ_WRITE_TOKEN` | 시연 영상 업로드가 로컬 폴백(`.local-blob/`)으로 동작. 코드 변경 없이 나중에 Vercel Blob으로 전환됨 |
| `CRON_SECRET` | 인사이트 재계산 배치 라우트가 **503으로 거부**(fail closed). 로컬에서 배치를 수동 실행할 때만 필요 |

> ⚠️ env 파일을 PowerShell `Set-Content -Encoding utf8`로 만들지 말 것 — BOM이 붙어 **첫 번째 키가 깨진다**. 그 키를 안 쓰는 스크립트는 멀쩡히 돌아서 원인이 늦게 드러난다(Story 4.1에서 실제로 당함). 에디터나 Git Bash `cp`를 쓴다.

### 2-4. `.env.test` 작성 (테스트를 돌릴 거면)

```bash
cp .env.test.example .env.test
```

```dotenv
DATABASE_URL="postgresql://wedding_check:wedding_check@localhost:5434/wedding_check_test"
```

`vitest.setup.ts`가 이 파일만 읽는다. 개발 DB를 여기 적으면 **테스트가 개발 데이터를 전부 TRUNCATE 한다.**

### 2-5. DB 띄우기

```bash
docker run -d --name wedding-check-db \
  -e POSTGRES_USER=wedding_check \
  -e POSTGRES_PASSWORD=wedding_check \
  -e POSTGRES_DB=wedding_check \
  -p 5434:5432 \
  pgvector/pgvector:pg16

until docker exec wedding-check-db pg_isready -U wedding_check >/dev/null 2>&1; do sleep 1; done

docker exec wedding-check-db psql -U wedding_check -d wedding_check \
  -c "CREATE DATABASE wedding_check_test OWNER wedding_check;"
```

### 2-6. 마이그레이션 적용

```bash
npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:5434/wedding_check"
npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:5434/wedding_check_test"
```

> ⚠️ `drizzle-kit migrate`는 이 로컬 환경에서 **무한 대기/무출력 실패**한다(Epic 1 회고, 원인 미규명). `scripts/apply-migrations.ts`가 확립된 경로이고 **빈 DB 전용**이다 — 증분 적용은 지원하지 않는다.
> 이미 적용된 DB에 새 마이그레이션 하나만 얹을 때는:
> `docker exec -i wedding-check-db psql -U wedding_check -d wedding_check < drizzle/00NN_*.sql`

### 2-7. 계정 시드

```bash
npm run seed
```

관리자 1명 + 오퍼레이터 1명을 만든다(`.env.local`의 `SEED_*` 값 그대로). 재실행해도 같은 시드 슬롯을 갱신할 뿐 중복 계정을 만들지 않는다.

### 2-8. 실행

```bash
npm run dev        # http://localhost:3000
```

`/`는 `/login`으로 리다이렉트된다. **전화번호 + 비밀번호**로 로그인한다(이메일 로그인은 서버에서 차단돼 있다). 관리자로 들어가면 `/admin`, 오퍼레이터는 `/operator`.

### 2-9. 첫 데이터 채우기 (순서 중요)

빈 DB에서는 로그인 후에도 볼 게 없다. 이 순서로 채운다.

1. **관리자로 로그인 → `/admin/halls`에서 홀 등록.** 홀이 이 아래 모든 것의 부모다.
2. (선택) **체크리스트 시드**

   ```bash
   npm run seed:ceremony-checklist
   ```

   실제 큐시트 기반 12개 단계와 하위 체크 항목을 **활성 홀 전체**에 넣는다. 아무것도 삭제하지 않는 upsert라 재실행해도 안전하지만, **홀을 먼저 등록하지 않으면 아무 일도 일어나지 않는다**(대상 홀이 없음).
3. `/admin/templates/<hallId>`에서 체크리스트 확인·편집.
4. `/admin/ceremonies`에서 예식 등록 → 계약 기반으로 인스턴스가 조립된다.
5. **오퍼레이터 계정으로 로그인 → `/operator`**에서 실행 화면(체크리스트 → 질의 → 피드백) 확인.

### 2-10. 두 번째 실행부터

```bash
docker start wedding-check-db
cd apps/web && npm run dev
```

### 2-11. 검증 4종 (CI와 동일)

```bash
npm test           # vitest — .env.test의 DB를 본다
npx tsc --noEmit
npm run lint
npm run build
```

---

## 3. 언제 워크트리를 쓰나

| 상황 | 판단 |
|---|---|
| 스토리 착수(`story/*`), 사이즈 있는 픽스(`fix/*`) | **워크트리** — Epic 3 이후 확립된 기본값 |
| 공유 dev DB(5434)나 포트 3000을 다른 세션이 이미 쓰는 중 | **워크트리** — 격리 DB/포트로 서로 안 건드림 |
| 마이그레이션(`drizzle/00NN_*.sql`)이 있는 스토리 | **워크트리 필수** — 빈 DB에 `0000~00NN` 전체 체인을 적용해 검증해야 하는데, 공유 dev DB에서는 그걸 못 한다 |
| 오타 수정, 문서 한 줄 | 현재 체크아웃에서 그냥 처리 |

워크트리를 쓰는 이유는 "브랜치를 여러 개 두려고"가 아니라 **DB 상태와 포트를 스토리별로 격리**하려는 것이다. 브랜치만 갈아끼우면 마이그레이션이 적용된 DB가 브랜치 사이를 따라다닌다.

---

## 4. 사전 확인 (30초)

```bash
docker ps
gh auth status            # Logged in to github.com account tkdlqh2
git -C <repo> worktree list
```

브랜치 사실관계(2026-08-03 기준):

- 원격 기본 브랜치는 **`main`**. PR도 `main`으로 간다(`ci.yml`의 `branches: [main]`).
- 로컬에는 `master`가 있고 `origin/main`과 **같은 커밋**이지만 upstream 설정이 없다. 헷갈리지 말고 **분기 기준은 항상 `origin/main`**을 쓴다.

---

## 5. 리소스 대장 (충돌 방지)

워크트리마다 앱 포트 1개 + DB 포트 1개 + 컨테이너 1개를 **새로** 잡는다. 재사용 금지 — 재사용하면 다른 세션의 DB를 지운다.

| 스토리 | 워크트리 | 앱 포트 | DB 포트 | 컨테이너 |
|---|---|---|---|---|
| 3.3 | `story-3-3-natural-language-query` | 3013 | 5436 | `wedding-check-db-story33` |
| 3.4 | `story-3-4-evidence-based-response` | 3014 | 5437 | `wedding-check-db-story34` |
| 4.1 | `story-4-1-pattern-clustering` | 3015 | 5438 | (동일 규칙) |
| 4.2 | `story-4-2-insight-admin-only` | 3016 | 5439 | (동일 규칙) |
| **다음 가용** | — | **3017** | **5440** | `wedding-check-db-story<NN>` |

3000 / 5434는 공유 개발 환경 몫이다. 워크트리에서 쓰지 않는다.
착수할 때 이 표에 자기 줄을 먼저 추가하고 시작한다(선점 = 충돌 예방).

---

## 6. 워크트리 착수 절차

Story 6.1을 예로 든 것이다. `SLUG` / `PORT` / `DBPORT` / `CTR` 네 값만 바꾸면 그대로 돌아간다.

### 6-1. 워크트리 생성

```bash
cd /c/Users/tkdlq/IdeaProjects/wedding-check

SLUG=story/6-1-query-voice-input
DIR=.claude/worktrees/story-6-1-query-voice-input
PORT=3017
DBPORT=5440
CTR=wedding-check-db-story61

git fetch origin
git worktree add -b "$SLUG" "$DIR" origin/main
```

- 브랜치명 규칙: 스토리는 `story/<에픽>-<번호>-<영문-슬러그>`, 지시/픽스는 `fix/<영문-슬러그>` (PR #21~#33 전부 이 형태).
- 워크트리 디렉터리명은 브랜치의 `/`를 `-`로 바꾼 형태.
- 브랜치가 이미 다른 워크트리에 체크아웃돼 있으면 `add`가 거부한다 — `git worktree list`로 어디에 있는지 먼저 본다.
- **`add -b <브랜치> <경로> origin/main`은 새 브랜치의 upstream을 `origin/main`으로 잡는다**(실측 확인). 그대로 두면 `git push`가 main을 겨냥한다 — 첫 푸시는 반드시 `git push -u origin "$SLUG"`로 자기 이름의 원격 브랜치를 만들어 upstream을 덮어쓴다.

**부모 레포 `git status` 오염 차단(최초 1회):**
`.claude/worktrees/`는 `.gitignore`에 없어서 부모 레포 status에 `?? .claude/worktrees/`로 뜬다(실측 확인). 레포 파일을 건드리지 않고 로컬에서만 막는다.

```bash
echo '.claude/worktrees/' >> .git/info/exclude
```

### 6-2. 부트스트랩

```bash
cd "$DIR/apps/web"
npm ci
```

`.env.local` / `.env.test`는 **gitignore 대상이라 워크트리에 따라오지 않는다.** 반드시 복사한다.

```bash
cp /c/Users/tkdlq/IdeaProjects/wedding-check/apps/web/.env.local .
cp /c/Users/tkdlq/IdeaProjects/wedding-check/apps/web/.env.test  .
```

복사 후 **이 워크트리 전용 값으로 3줄을 고친다**:

```dotenv
# .env.local
DATABASE_URL="postgresql://wedding_check:wedding_check@localhost:5440/wedding_check"
BETTER_AUTH_URL="http://localhost:3017"        # dev 포트와 반드시 일치

# .env.test
DATABASE_URL="postgresql://wedding_check:wedding_check@localhost:5440/wedding_check_test"
```

### 6-3. 격리 DB 기동 + 마이그레이션

§2-5 / §2-6과 같되 이름과 포트만 워크트리 값으로 바꾼다.

```bash
docker run -d --name "$CTR" \
  -e POSTGRES_USER=wedding_check -e POSTGRES_PASSWORD=wedding_check -e POSTGRES_DB=wedding_check \
  -p $DBPORT:5432 pgvector/pgvector:pg16
until docker exec "$CTR" pg_isready -U wedding_check >/dev/null 2>&1; do sleep 1; done
docker exec "$CTR" psql -U wedding_check -d wedding_check -c "CREATE DATABASE wedding_check_test OWNER wedding_check;"

npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:$DBPORT/wedding_check"
npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:$DBPORT/wedding_check_test"

npm run seed
```

### 6-4. 개발 · 검증

```bash
npm run dev -- -p $PORT     # http://localhost:3017
npm test
npx tsc --noEmit
npm run lint
npm run build
```

병합 전 로컬에서 이 4종이 전부 클린이어야 한다. CI에서 처음 터지면 왕복이 한 번 더 늘 뿐이다.

---

## 7. PR → 리뷰 → 병합

```bash
git add -A && git commit          # 단계별로 쪼개서 커밋 (feat/fix/test/docs(<스토리번호>): ...)
git push -u origin "$SLUG"
gh pr create --base main --fill
gh pr checks --watch              # CI 그린 확인
# 코덱스 리뷰 → P1/P2 있으면 같은 브랜치에서 수정 후 재리뷰, 클린 나올 때까지
gh pr merge --merge --delete-branch
```

- 병합 방식은 `--merge`(머지 커밋)로 고정 — PR #21~#33 전부 이 방식.
- `--delete-branch`가 **로컬 브랜치 삭제에서 실패**할 수 있다: 그 브랜치가 아직 워크트리에 체크아웃돼 있기 때문. 워크트리를 먼저 정리하거나(§8), 원격만 지우고 로컬은 나중에 지운다.
- 리뷰 라운드 결과는 `git_pipeline` 노트에 남긴다 — Story 4.1은 5라운드 P1 4건이었고, 그 연쇄가 다음 스토리의 근거가 된다.

`git_pipeline` 단계값: `branch-created → committing → pushed → pr-open → codex-review → (changes-requested) → merged` (정의는 `sprint-status.yaml` 헤더 주석).

---

## 8. 정리

```bash
cd /c/Users/tkdlq/IdeaProjects/wedding-check

docker rm -f "$CTR"                    # 격리 DB 폐기 — 남겨두면 다음 스토리가 포트를 못 잡는다
git worktree remove "$DIR"             # node_modules 등으로 거부하면 --force
git worktree prune
git branch -d "$SLUG"                  # 병합 완료 후
git fetch origin --prune
```

마지막으로 `sprint-status.yaml`을 갱신한다:

- `development_status`의 스토리 상태 → `done`
- `git_pipeline.<스토리>`: `stage: merged`, `pr_url`, `merge_commit`, `notes`, `last_updated`
- `notes`에는 **결정과 그 근거, 그리고 다음 사람이 걸려 넘어질 함정**을 쓴다. "무엇을 했다"만 쓴 노트는 이 레포에서 쓸모가 없었다.
- §5 리소스 대장에서 자기 줄을 정리(또는 이력으로 남김).

---

## 9. 함정 모음 (전부 이 레포에서 실제로 겪은 것)

**9-1. 부모 레포 status에 `?? .claude/worktrees/`가 뜬다.**
`.claude/`는 추적되는 디렉터리인데 `worktrees/`는 ignore 목록에 없다(실측 확인). → §6-1의 `.git/info/exclude` 한 줄로 막는다.

**9-2. `.env*`가 워크트리에 안 따라온다.**
gitignore 대상이라 새 워크트리는 env가 아예 없다. 앱이 부팅은 되는데 DB/인증이 이상하게 죽으면 여기부터 본다.

**9-3. PowerShell이 env 파일에 BOM을 붙인다.**
`Set-Content -Encoding utf8` → 첫 키가 깨짐. 그 키를 안 쓰는 스크립트는 멀쩡히 돌아서 원인이 늦게 드러난다(Story 4.1).

**9-4. `next dev` 재시작 시 낡은 서버가 응답한다.**
포트가 점유된 채면 새 서버는 바인딩에 실패하는데 요청은 이전 프로세스가 받는다 — 코드를 고쳤는데 안 바뀌는 것처럼 보인다. PID 확인 후 `taskkill` (Story 3.4).

**9-5. Git Bash `curl -d`에 한글을 직접 넣으면 인코딩이 깨진다.**
임베딩 검증에서 유사도가 0.11로 나온 원인이었다. UTF-8 파일 + `--data-binary @file`로 보낸다 (Story 3.4).

**9-6. `drizzle-kit migrate`는 여기서 무한 대기한다.** → §2-6 참고.

**9-7. `BETTER_AUTH_URL`이 dev 포트와 다르면 로그인이 조용히 깨진다.**
워크트리 포트를 3017로 바꿔놓고 URL을 3000으로 두는 실수가 가장 흔하다.

**9-8. `.env.test`에 개발 DB를 적으면 테스트가 개발 데이터를 전부 지운다.**
DB 통합 테스트는 `beforeEach`에서 전체 테이블을 TRUNCATE 한다.

**9-9. 순정 `postgres` 이미지로는 마이그레이션이 실패한다.**
`vector` 타입이 없다. 반드시 `pgvector/pgvector:pg16`(CI와 동일 이미지).

**9-10. `npm run seed:ceremony-checklist`는 홀이 없으면 아무 일도 안 한다.**
활성 홀 전체를 대상으로 도는 스크립트다. 홀 등록이 선행돼야 한다.

**9-11. 새 브랜치의 upstream이 `origin/main`으로 잡힌다.**
`git worktree add -b <브랜치> <경로> origin/main`의 부작용. 첫 푸시를 `git push -u origin "$SLUG"`로 하지 않으면 main을 겨냥한다. → §6-1.

---

## 10. 한 번에 붙여넣기

### 10-1. 최초 세팅 (공유 개발 환경)

```bash
cd /c/Users/tkdlq/IdeaProjects/wedding-check/apps/web
npm ci
cp .env.local.example .env.local
cp .env.test.example  .env.test
# → .env.local: DATABASE_URL(5434/wedding_check), BETTER_AUTH_SECRET(openssl rand -hex 32),
#               BETTER_AUTH_URL=http://localhost:3000, SEED_* 4개
# → .env.test : DATABASE_URL(5434/wedding_check_test)

docker run -d --name wedding-check-db \
  -e POSTGRES_USER=wedding_check -e POSTGRES_PASSWORD=wedding_check -e POSTGRES_DB=wedding_check \
  -p 5434:5432 pgvector/pgvector:pg16
until docker exec wedding-check-db pg_isready -U wedding_check >/dev/null 2>&1; do sleep 1; done
docker exec wedding-check-db psql -U wedding_check -d wedding_check \
  -c "CREATE DATABASE wedding_check_test OWNER wedding_check;"

npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:5434/wedding_check"
npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:5434/wedding_check_test"

npm run seed
npm run dev            # http://localhost:3000 → /login → 전화번호 + 비밀번호
# 로그인 후: /admin/halls 홀 등록 → npm run seed:ceremony-checklist → /admin/ceremonies 예식 등록
```

### 10-2. 워크트리 착수

```bash
# ── 값 4개만 바꾼다 ────────────────────────────────
SLUG=story/6-1-query-voice-input
DIR=.claude/worktrees/story-6-1-query-voice-input
PORT=3017
DBPORT=5440
CTR=wedding-check-db-story61
ROOT=/c/Users/tkdlq/IdeaProjects/wedding-check
# ──────────────────────────────────────────────────

cd "$ROOT"
git fetch origin
git worktree add -b "$SLUG" "$DIR" origin/main
grep -qxF '.claude/worktrees/' .git/info/exclude || echo '.claude/worktrees/' >> .git/info/exclude

cd "$DIR/apps/web"
npm ci
cp "$ROOT/apps/web/.env.local" . && cp "$ROOT/apps/web/.env.test" .
# → .env.local의 DATABASE_URL/BETTER_AUTH_URL, .env.test의 DATABASE_URL을 $DBPORT/$PORT로 수정

docker run -d --name "$CTR" \
  -e POSTGRES_USER=wedding_check -e POSTGRES_PASSWORD=wedding_check -e POSTGRES_DB=wedding_check \
  -p $DBPORT:5432 pgvector/pgvector:pg16
until docker exec "$CTR" pg_isready -U wedding_check >/dev/null 2>&1; do sleep 1; done
docker exec "$CTR" psql -U wedding_check -d wedding_check -c "CREATE DATABASE wedding_check_test OWNER wedding_check;"

npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:$DBPORT/wedding_check"
npx tsx scripts/apply-migrations.ts "postgresql://wedding_check:wedding_check@localhost:$DBPORT/wedding_check_test"
npm run seed

npm run dev -- -p $PORT
```

---

**출처:** `_bmad-output/implementation-artifacts/sprint-status.yaml` (`git_pipeline` 노트, Story 3.3/3.4/4.1/4.2) · `.github/workflows/ci.yml` · `apps/web/.env.local.example` · `apps/web/.env.test.example` · `apps/web/scripts/apply-migrations.ts` · `apps/web/scripts/seed-accounts.ts` · `apps/web/scripts/seed-ceremony-checklist.ts` · `apps/web/vitest.setup.ts`
**최초 작성:** 2026-08-03
