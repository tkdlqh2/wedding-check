---
baseline_commit: 4fb2af536dc31829ca4dd195a2ef1ce011d9f77f
---

# Story 1.4: 시연 영상 업로드 및 연결

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 체크리스트 항목에 시연 영상을 업로드하고 재생 확인할 수 있기를,
so that 신입 오퍼레이터가 조작법을 영상으로 학습할 수 있다.

## Acceptance Criteria

1. Given 체크리스트 항목이 등록되어 있을 때, When 영상 파일을 업로드하면, Then `@vercel/blob` 클라이언트 사이드 멀티파트 업로드로 서버 바디 제한 없이 업로드되고, DB 행은 `onUploadCompleted` 서버 콜백에서만 생성된다(AD-4). **로컬 개발 예외:** 이 저장소에는 아직 Vercel Blob store가 프로비저닝되지 않아 `BLOB_READ_WRITE_TOKEN`이 없다 — `BLOB_READ_WRITE_TOKEN` 부재 시에만 로컬 파일시스템 폴백 경로를 쓴다(아래 "로컬/프로덕션 듀얼 스토리지 전략" 참고, 2026-07-26 사용자 승인 결정). 토큰이 설정되면 자동으로 AD-4 경로로 전환된다.
2. Given 업로드된 영상이 있을 때, When 항목을 조회하면, Then 영상이 바로 재생 가능하다.
3. Given mp4가 아니거나 500MB를 초과하는 파일을 업로드하면, When 업로드를 시도하면, Then 업로드가 거부되고 명확한 오류가 표시된다(`[ASSUMPTION]` 형식 mp4, 500MB 상한 — PRD FR-3).
4. Given 영상을 첨부하지 않은 상태에서, When 항목을 저장하면, Then 정상적으로 저장된다(영상은 선택 필드 — 이미 사실: 영상 업로드는 Story 1.3의 항목 생성/수정 액션과 완전히 분리된 별도 경로이므로 추가 구현 없이 성립).

## Tasks / Subtasks

- [x] Task 1: `demo_videos` 테이블 스키마 + 마이그레이션 (AC: 1, 2, 3)
  - [x] `lib/db/schema.ts`에 `demoVideos` 테이블 추가: `id`(uuid, `defaultRandom()`, PK), `hallId`(uuid, not null, `references(() => halls.id)` — AD-2 홀 종속 엔티티, 스파인이 `demo_videos`를 명시적으로 홀 종속 목록에 포함시킴), `templateItemId`(uuid, not null, `references(() => checklistTemplateItems.id)`, **unique 제약** — 항목당 영상 슬롯은 1개, 아래 "[ASSUMPTION] 항목당 영상 1개" 참고), `videoUrl`(text, not null), `fileName`(text, not null — 원본 파일명, 표시용), `fileSizeBytes`(integer, not null — 500MB는 524,288,000이라 `integer`(최대 ~2.1GB) 범위 안, `bigint` 불필요), `storageProvider`(text, not null — `"vercel-blob" | "local"`, 어느 서빙 경로로 읽어야 하는지 구분), `createdAt`/`updatedAt`(halls와 동일 패턴)
  - [x] `npx drizzle-kit generate`로 마이그레이션 생성(DB 연결 없이 스키마 diff만으로 생성됨, Story 1.1~1.3에서 확인된 방식) — `0006_flawless_korvac.sql`
  - [x] 로컬 Postgres에 마이그레이션 적용 — **주의(신규 발견):** `npx drizzle-kit migrate`가 이 DB에서 멈춤/실패(exit 1, 에러 메시지 없이 스피너만 출력) — `drizzle.__drizzle_migrations` 추적 테이블이 비어있는 채로 0000~0005가 이미 테이블로 존재해(과거 스토리들이 `migrate` CLI가 아닌 다른 방식으로 적용한 것으로 추정) 충돌하는 것으로 보임. 신규 마이그레이션(`0006_*.sql`)만 `docker exec -i wedding-check-db psql -U wedding_check -d wedding_check < drizzle/0006_flawless_korvac.sql`로 직접 적용해 우회 — `\d demo_videos`로 테이블/FK/unique 제약 생성 확인 완료.

- [x] Task 2: 스토리지 상수 + 로컬 파일 저장 유틸 (AC: 1, 2, 3)
  - [x] `lib/storage/video-storage.ts`(NEW): `isBlobStorageConfigured()`, `MAX_VIDEO_SIZE_BYTES`, `ALLOWED_VIDEO_CONTENT_TYPE` — 서버 전용 코드 없이 클라이언트에서도 import 가능하게 구성.
  - [x] `lib/storage/local-video-store.ts`(NEW, 서버 전용): `saveLocalVideoFile`, `isValidLocalVideoFileName`, `localVideoFilePath` 구현.

- [x] Task 3: 리포지토리 레이어 — `lib/db/repositories/demo-video.ts` (AC: 1, 2)
  - [x] `upsertForTemplateItem` — 단일 `ON CONFLICT DO UPDATE` 문(재시도 래퍼 불필요, 과잉 적용 회피).
  - [x] `findByTemplateItemIds` — 빈 배열 가드 + `WHERE hall_id = $hallId AND template_item_id IN (...)`(AD-2).
  - [x] 모든 함수 첫 인자 `hallId`(AD-2).

- [x] Task 4: 서비스 레이어 — `lib/services/demo-video.ts` (AC: 1, 2, 3)
  - [x] `DemoVideoValidationError extends Error`
  - [x] `assertTemplateItemOwnedByHall` — AD-2 2-hop 재검증, `templateItemRepo.findById(hallId, id)` 재사용. blob 업로드 라우트의 `onBeforeGenerateToken`에서도 직접 호출해야 해서 named export로 분리.
  - [x] `saveDemoVideo` — 소유권 검증 후 리포지토리 위임.
  - [x] `listDemoVideosByItems` — 리포지토리 위임.

- [x] Task 5: 로컬 영상 서빙 Route Handler (AC: 2 — 로컬 폴백 모드에서만 동작)
  - [x] `app/api/local-videos/[fileName]/route.ts`(NEW): `GET` 핸들러, path traversal 차단 + Range 요청 지원(206/Content-Range) 구현 완료.

- [x] Task 6: 업로드 Route Handler 2종 (AC: 1, 2, 3)
  - [x] `@vercel/blob` 설치(2.6.1). 설치된 타입 확인 결과 `onBeforeGenerateToken`은 실제로 `(pathname, clientPayload, multipart)` 3개 인자(문서 예제는 3번째를 생략) — 구현 시 실제 `.d.ts`로 재확인함.
  - [x] `app/api/templates/[hallId]/items/[itemId]/video/local/route.ts`(NEW): 계획대로 구현.
  - [x] `app/api/templates/[hallId]/items/[itemId]/video/blob/route.ts`(NEW): `head(blob.url)`로 서버 검증된 크기를 재조회해 저장(클라이언트 `clientPayload` 값을 그대로 믿지 않음). 로컬에서는 `onUploadCompleted`가 호출되지 않아 종단 검증 불가 — Task 9에 인계.

- [x] Task 7: 업로드 UI 컴포넌트 + 항목 카드 통합 (AC: 1, 2, 3, 4)
  - [x] `video-upload.tsx`(NEW): 계획대로 구현(클라이언트 사전 검증 → blob/local 분기 업로드 → `router.refresh()`, 버튼 disabled로 중복 제출 방지).
  - [x] `template-item-row.tsx`(UPDATE): `demoVideo`/`blobEnabled` prop 추가, `<video controls>` 또는 "영상 없음" + `<VideoUpload>` 항상 노출.
  - [x] `page.tsx`(UPDATE): `listDemoVideosByItems` + `isBlobStorageConfigured()`로 데이터 준비 후 각 행에 전달.
  - [x] `templates.css`(UPDATE): 비디오 블록 스타일 추가, 기존 `.field-error` 재사용.

- [x] Task 8: 환경 설정 문서화 (AC: 1)
  - [x] `.env.local.example`(UPDATE): `BLOB_READ_WRITE_TOKEN=""` + 설명 주석 추가.
  - [x] `apps/web/.gitignore`(UPDATE): `.local-blob/` 추가.

- [x] Task 9: 수동 검증 (AC: 1, 2, 3, 4)
  - [x] 로컬 폴백 경로로 "video/mp4" 타입 파일 업로드 → `demo_videos` 행 생성 확인(`psql`, `storage_provider: local`) → 항목 조회 페이지 HTML에 `<video controls src="/api/local-videos/...">` 렌더 확인, `GET /api/local-videos/<file>`가 200(전체)/206(`Range: bytes=0-99`) 정상 응답 확인(AC 1 로컬 예외 경로, AC 2)
  - [x] `text/plain` 타입 파일 업로드 시도 → 서버 400 `{error:{code:"invalid_type"}}` 확인(AC 3)
  - [x] 500MB+1바이트 파일 업로드 시도 → 서버 400 `{error:{code:"too_large"}}` 확인(실제 초과 크기로 검증, 원복 불필요 — 상수 변경 없이 테스트)(AC 3)
  - [x] 영상 없이 새 항목 생성(Story 1.3 액션 재사용) → 정상 저장, 카드에 "영상 없음" 안내 + 업로드 폼만 표시 확인(AC 4, 회귀 없음)
  - [x] AD-2 회귀: A홀(`1층 홀`) 소속 `templateItemId`를 B홀(`2층 홀`)의 `hallId` URL 세그먼트와 조합해 로컬 업로드 라우트 직접 호출 → 404 확인, DB에 해당 행 생성 안 됨 확인
  - [x] operator 세션으로 로컬 업로드 라우트 직접 POST → `requireAdminSession()`이 throw해 차단 확인(AD-3), DB에 행 생성 안 됨 확인
  - [x] path traversal 시도(`/api/local-videos/..%2f..%2fpackage.json`) → 404 확인
  - [x] `npm run lint`, `npx tsc --noEmit`, `npm run build` 모두 통과 확인
  - [x] **`@vercel/blob` 경로는 로컬에서 종단 검증 불가능** — `onUploadCompleted`가 localhost에 도달하지 않음(공식 문서 명시 사항, Dev Notes 참고). `onBeforeGenerateToken`의 인가/소유권 검증 로직은 코드 리딩으로 확인(local 라우트와 동일한 `requireAdminSession`/`assertTemplateItemOwnedByHall`/`isValidUuid` 호출 순서 사용). **실제 업로드 → `onUploadCompleted` → DB 행 생성까지의 종단 플로우는 검증하지 못했다 — 완료로 보고하지 않음.** 이 인계 사항은 Dev Agent Record에 별도 기록.

## Dev Notes

### 아키텍처 준수사항

- 소스: `_bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md`
- **AD-4(영상 업로드 서버 바디 제한 우회)**: 원칙은 그대로 따르되, 로컬 개발 인프라 부재로 인한 폴백이 아래 "로컬/프로덕션 듀얼 스토리지 전략"에 명시된 대로 병행 구현된다. **DB 행 쓰기는 두 경로 모두에서 "신뢰할 수 있는 서버 코드"만 수행한다** — blob 경로는 `onUploadCompleted` 콜백, local 경로는 파일 바이트를 직접 받은 그 Route Handler 자신(별도 콜백 홉이 없으므로 그 자리가 곧 신뢰 지점).
- **AD-2(리포지토리 레이어 독점 + 홀 격리)**: `demo_videos`는 스파인이 명시한 홀 종속 엔티티 목록에 포함(§55 Consistency Conventions 표에도 등재). 모든 리포지토리 함수는 `hallId` 필수 첫 인자 + `WHERE hall_id = $hallId`. **2-hop 재검증**: `templateItemId`만으로 항목을 신뢰하지 않고, `assertTemplateItemOwnedByHall`(Task 4)이 `templateItemRepo.findById(hallId, id)`로 그 항목이 실제 `hallId` 소속인지 매 쓰기 경로마다 재확인한다 — 스파인 §57이 `checklist_instance_items`에 대해 명시한 것과 동일한 안전장치를 `demo_videos`에도 적용.
- **AD-3(역할 2종)**: 두 업로드 Route Handler 모두 `requireAdminSession()`을 첫 줄에서 호출(Story 1.2 코덱스 P1 교훈 — layout 가드는 페이지 렌더링만 막고 API Route를 보호하지 않음. Server Action뿐 아니라 Route Handler도 동일한 맹점이 있다는 점을 이 스토리가 처음 검증).
- **Consistency Conventions**: API 오류 응답은 `{ error: { code: string, message: string } }` 단일 봉투 형식(스파인 §119) — 업로드 Route Handler의 400 응답에 그대로 적용.

### 로컬/프로덕션 듀얼 스토리지 전략 (2026-07-26 사용자 승인 결정, `[ASSUMPTION]`)

- **문제:** AD-4는 `@vercel/blob/client` 클라이언트 사이드 업로드를 강제하지만, 이 저장소는 아직 Vercel 프로젝트/Blob store에 연결되어 있지 않아 `BLOB_READ_WRITE_TOKEN`이 없다(Story 1.2/1.3에서 `DATABASE_URL`이 Neon 플레이스홀더였던 것과 동일한 종류의 인프라 공백). 게다가 실제 토큰이 생기더라도 `onUploadCompleted` 웹훅은 **localhost에 도달할 수 없어**(Vercel 공식 문서 명시, ngrok 등 터널링 필요) 로컬 환경에서는 어차피 종단 검증이 불가능하다.
- **결정:** `lib/db/index.ts`의 `isLocalPostgres` 듀얼 드라이버 분기와 동일한 사상으로, `isBlobStorageConfigured()`(`BLOB_READ_WRITE_TOKEN` 존재 여부)에 따라 업로드 경로 자체를 분기한다:
  - **토큰 있음(프로덕션/향후):** AD-4 그대로 — `@vercel/blob/client`의 `upload()` + `handleUpload()` + `onUploadCompleted`.
  - **토큰 없음(현재 로컬 기본값):** 일반 `POST` Route Handler로 파일을 직접 받아 로컬 디스크(`.local-blob/demo-videos/`)에 저장하고 그 자리에서 DB 행을 쓴다. Route Handler는 Server Action(기본 1MB 바디 제한, `bodySizeLimit` 설정 필요)과 달리 기본 바디 크기 제한이 없고(이번 세션에 확인, `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`), 로컬 `next dev`는 Vercel Functions의 4.5MB 요청 제한(AD-4가 실제로 우회하려는 대상)도 적용받지 않으므로, 로컬 환경에서는 이 방식이 AD-4가 막으려는 문제 자체가 발생하지 않는다.
- **재검토 조건:** `BLOB_READ_WRITE_TOKEN`이 설정되는 즉시 신규 업로드는 자동으로 blob 경로를 타므로 코드 변경 불필요. 기존에 로컬 경로로 저장된 영상(`storageProvider: "local"`)은 별도 마이그레이션 없이 `/api/local-videos/*`로 계속 서빙됨(두 storageProvider 값이 영구 공존 가능하도록 설계됨).

### `[ASSUMPTION]` — 항목당 시연 영상은 최대 1개(재업로드 시 교체)

- 스파인 ERD(§161-171)는 `CHECKLIST_TEMPLATE_ITEM ||--o{ DEMO_VIDEO`(1:N)로 표기하지만, PRD FR-3/Notes와 epics AC 어디에도 "항목당 여러 영상"이나 "영상 이력"을 시사하는 문장이 없다 — FR-3 Description은 "항목별로 영상 파일을 업로드"(단수)라고만 쓰여 있다.
- **결정:** `demo_videos.template_item_id`에 UNIQUE 제약을 걸어 항목당 최대 1행으로 제한한다. 재업로드는 `ON CONFLICT DO UPDATE`로 기존 행을 교체(덮어쓰기)한다 — 이전 blob/로컬 파일은 즉시 삭제하지 않는다(고아 파일 정리는 PRD §11 Open Q2 "저장/보존 기간 정책 미정"에 걸려 있는 별도 이슈, 이 스토리 범위 밖, Deferred). ERD의 1:N 표기는 향후(v2) 이력 기능으로 확장할 여지를 남긴 것으로 해석하며, 확정되면 이 `[ASSUMPTION]`을 갱신한다.

### 라이브러리/최신 기술 정보 — `@vercel/blob` 클라이언트 업로드 API (2026-07-26 웹 검증)

**신규 의존성**: `@vercel/blob`(아키텍처 스파인 §Stack이 이미 승인, 별도 사용자 승인 불필요). 아래는 공식 문서(vercel.com/docs/vercel-blob) 기준 정확한 시그니처 — 학습 데이터의 옛 API와 다를 수 있으니 이 내용을 그대로 따를 것:

```ts
// 클라이언트(video-upload.tsx)
import { upload } from '@vercel/blob/client';

const blob = await upload(file.name, file, {
  access: 'public',
  handleUploadUrl: `/api/templates/${hallId}/items/${templateItemId}/video/blob`,
  clientPayload: JSON.stringify({ fileSize: file.size }),
});
```

```ts
// 서버(app/api/templates/[hallId]/items/[itemId]/video/blob/route.ts)
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
      // requireAdminSession() + assertTemplateItemOwnedByHall() 여기서 호출
      return {
        allowedContentTypes: ['video/mp4'],
        maximumSizeInBytes: 500 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ hallId, templateItemId, fileSize }),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      // saveDemoVideo(...) 여기서 호출 — 로컬에서는 절대 호출 안 됨
    },
  });
  return NextResponse.json(jsonResponse);
}
```

- `onBeforeGenerateToken`은 `(pathname, clientPayload)`를 받는다(순서 고정). `hallId`/`itemId`는 이 함수 밖(라우트 세그먼트)에서 이미 알 수 있으므로 클로저로 캡처해서 쓴다 — `clientPayload`는 오직 `fileSize` 전달용.
- `onUploadCompleted`의 `blob`(`PutBlobResult`)에는 `pathname`/`contentType`/`contentDisposition`/`url`/`downloadUrl`/`etag`만 있고 **`size` 필드가 없다** — 크기가 필요하면 `head(blob.url)`(같은 패키지에서 import)을 호출해 서버가 직접 재확인할 것(클라이언트 보고값을 그대로 믿지 않는다는 AD-4 원칙의 연장).
- `onUploadCompleted`은 로컬에서 Vercel이 `localhost`에 도달할 수 없어 **호출되지 않는다**(ngrok 등 터널링 없이는). 이 스토리는 ngrok 설정을 하지 않으므로 blob 경로는 코드 완성 + 프로덕션 배포 후 검증으로 인계한다(Task 9 마지막 항목).
- Source: [Client Uploads with Vercel Blob](https://vercel.com/docs/vercel-blob/client-upload), [@vercel/blob SDK Reference](https://vercel.com/docs/vercel-blob/using-blob-sdk)

### Next.js 16 관련 확인 사항 (`AGENTS.md` 경고 대응)

- `apps/web/AGENTS.md`가 "이 버전은 학습 데이터와 다를 수 있다"고 명시 — 이번 세션에 `node_modules/next/dist/docs/`에서 직접 확인한 사실: **Server Action의 기본 바디 크기 제한은 1MB**(`serverActions.bodySizeLimit`로 조정 가능하지만 이 스토리는 아예 Route Handler를 써서 이 제한 자체를 우회한다 — Server Action으로 영상 업로드를 구현하려 하면 즉시 실패하므로 반드시 Route Handler로 구현할 것, 위 Task 6/7 설계와 일치).

### 테스트 요구사항

- 자동화 테스트 프레임워크 미지정(Story 1.1~1.3과 동일 정책) — Task 9의 수동 검증 절차를 그대로 따를 것.
- **blob 경로는 로컬에서 종단 검증 불가능** — `onBeforeGenerateToken`의 인가/검증 로직까지는 로컬에서 유닛 레벨로 확인 가능하지만(직접 호출해 토큰 응답이 기대한 `allowedContentTypes`/`maximumSizeInBytes`를 포함하는지), `onUploadCompleted` → DB 행 생성까지의 종단 플로우는 프로덕션 배포 이후로 인계. 이걸 "완료"로 거짓 보고하지 말 것 — Dev Agent Record에 정확히 어디까지 검증했는지 명시.

### Project Structure Notes

- `app/admin/templates/[hallId]/`(Story 1.3)에 `video-upload.tsx` 추가, `page.tsx`/`template-item-row.tsx`/`templates.css` UPDATE.
- 신규 최상위 디렉토리: `lib/storage/`(NEW — DB/AI에 이은 세 번째 인프라 추상화 레이어, `lib/db/`·`lib/ai/`와 동급).
- 신규 API 디렉토리: `app/api/local-videos/[fileName]/`, `app/api/templates/[hallId]/items/[itemId]/video/{local,blob}/` — 스파인 Structural Seed의 `api/query`, `api/feedback`과 같은 레벨(`app/api/` 하위, Route Handler는 Consistency Conventions상 "지연시간/바디 제어가 필요한 기능"에 해당하므로 Server Action이 아닌 Route Handler로 배치하는 것이 스파인과 일치).

### Previous Story Intelligence (Story 1.3)

- **`db.transaction()`은 프로덕션 드라이버(neon-http)에서 무조건 throw** — 이 스토리의 UPSERT는 애초에 단일 SQL 문으로 설계해 이 함정을 피해간다(Task 3 참고). 절대 `db.transaction()`을 새로 도입하지 말 것.
- **drizzle 에러는 `.cause`로 원본 드라이버 에러를 감싼다** — 이번 스토리는 재시도 로직이 필요 없어(단일 UPSERT) 해당사항 없지만, 혹시 향후 동시성 이슈가 발견되면 이 패턴을 기억할 것.
- **`hallId`/`id` 형식 검증을 빼먹으면 uuid 컬럼 비교에서 500이 샌다** — Story 1.3 코덱스 6차 교훈, 이번 스토리의 모든 라우트(`hallId`, `itemId`, 로컬 파일명)에도 동일하게 적용(Task 2/6에 이미 반영).
- **`requireAdminSession()`을 모든 관리자 API의 첫 줄에서 호출** — layout 가드는 Server Action뿐 아니라 Route Handler도 보호하지 않는다(Story 1.2 발견 사항을 Route Handler로 처음 확장 적용).
- **Server Action은 Node `fetch`/`FormData`로 재현**(Windows/한글 로케일에서 curl 인코딩 깨짐) — 이번 스토리의 업로드 라우트는 Server Action이 아닌 일반 Route Handler라 표준 `fetch(url, {method:"POST", body: formData})`로 더 단순하게 검증 가능(액션 ID/hidden 필드 파싱 불필요).

### Git Intelligence (최근 작업 패턴)

- 최근 커밋: PR #5(Story 1.3, 7차 코덱스 리뷰, 일반 merge) → PR #4(로컬 DB 전환) → PR #3(전화번호 로그인) → PR #2(Story 1.2) → PR #1(Story 1.1).
- 파이프라인(변경 없음): `story/1-4-demo-video-upload` 브랜치 생성 → 단계별 커밋 → `codex review --base main` → 지적사항 있으면 수정 후 재리뷰(반복) → 클린하면 `gh pr merge --merge --delete-branch`(스쿼시 아님) → `sprint-status.yaml`의 `git_pipeline` 섹션 갱신.
- Story 1.3의 코덱스 7라운드는 전부 동시성/견고성 결함이었다 — 이번 스토리는 동시성이 훨씬 단순(단일 UPSERT)하지만, **파일 업로드 특유의 새로운 리뷰 포인트**를 예상할 것: path traversal(로컬 파일명), 서버 검증 우회(클라이언트 체크만 믿는 경우), AD-2 2-hop 누락, `requireAdminSession()` 누락, Range 요청 미지원으로 인한 재생 실패 등.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: 홀·체크리스트 템플릿 관리 / Story 1.4]
- [Source: _bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md#FR-3, §11 Open Questions Q2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-4, #Consistency Conventions, #핵심 엔티티 ERD, #Stack, #Structural Seed]
- [Source: DESIGN.md#4 Component Stylings, #14 States(Loading/Error), #10 Voice & Tone]
- [Source: _bmad-output/implementation-artifacts/1-3-checklist-item-registration.md#Dev Notes, #Dev Agent Record — db.transaction() 함정, hallId 검증, requireAdminSession 패턴]
- [Source: https://vercel.com/docs/vercel-blob/client-upload — 2026-07-26 웹 검증, onUploadCompleted 로컬 제약 포함]
- [Source: https://vercel.com/docs/vercel-blob/using-blob-sdk — 2026-07-26 웹 검증, onBeforeGenerateToken 옵션 전체 목록]
- [Source: apps/web/node_modules/next/dist/docs/01-app/02-guides/server-actions.md — Server Action 기본 바디 제한 1MB, 2026-07-26 로컬 확인]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- 마이그레이션 적용: `npx drizzle-kit migrate`가 이 로컬 DB에서 `Exit code 1`(에러 메시지 없이 스피너만 출력)로 실패 — `drizzle.__drizzle_migrations` 추적 테이블이 비어있는 채로 0000~0005 테이블이 이미 존재해 충돌하는 것으로 추정(과거 스토리들이 `migrate` CLI가 아닌 방식으로 적용한 흔적). 신규 마이그레이션(`0006_flawless_korvac.sql`)만 `docker exec -i wedding-check-db psql ... < 0006_*.sql`로 직접 적용해 우회, `\d demo_videos`로 스키마 확인 완료.
- `@vercel/blob` 2.6.1 설치 후 실제 `.d.ts`를 직접 확인 — 웹 문서 예제와 달리 `onBeforeGenerateToken`의 실제 시그니처는 `(pathname, clientPayload, multipart)` 3개 인자였고, `PutBlobResult`에 `size` 필드가 없어 `head(blob.url)`로 서버 검증된 크기를 재조회하도록 구현(문서 예제를 그대로 베끼지 않고 설치된 타입으로 재검증).
- 수동 검증 중 기존(Story 1.3 이전 세션에서 남은) `next dev` 프로세스가 반복적인 파일 수정 이후 "Failed to find Server Action" 500 에러를 계속 뱉어 Story 1.3의 create action 재사용 테스트(AC 4)가 막혔다 — 프로세스를 완전히 종료 후 새로 시작해도 재현되어, 원인을 좁혀보니 실은 **내 검증 스크립트 자체의 정규식 이중 이스케이프 버그**(`\\$ACTION_N:0` 형태로 이미 이스케이프된 문자열을 다시 이스케이프하는 헬퍼에 전달)였음 — 애플리케이션 코드 문제 아님, 스크립트 수정 후 정상 동작 확인.
- 로컬 업로드 경로(AC 1 예외/AC 2/AC 3/AD-2/AD-3)는 실제 HTTP 요청으로 종단 검증(500MB+1바이트 실제 버퍼 업로드 포함). `@vercel/blob` 경로(AC 1 원 경로)는 Vercel 문서가 명시하듯 `onUploadCompleted`가 localhost에 도달하지 않아 로컬에서 종단 검증 불가 — `onBeforeGenerateToken`의 인가 로직만 코드 리딩으로 확인, 실제 업로드 플로우는 미검증.

### Completion Notes List

- **코덱스 리뷰 1차**(PR #6) — 3건 모두 실제 결함이었다:
  1. 로컬 업로드 라우트가 프로덕션(BLOB_READ_WRITE_TOKEN 설정됨)에서도 호출 가능(P1) — 서버리스 배포에서 로컬 파일시스템은 인스턴스 간 비영속이라 저장 직후 URL이 깨짐. `isBlobStorageConfigured()`가 true면 로컬 라우트가 404를 반환하도록 가드 추가, 실제로 토큰을 임시 설정해 서버 재시작 후 404 확인.
  2. 영상이 연결된 항목을 기존 삭제 액션으로 삭제하면 새 FK(`ON DELETE NO ACTION` 기본값)에 막혀 500(P1, 영상 첨부 전에는 되던 삭제가 첨부 후 회귀) — `templateItemId` FK에 `onDelete: "cascade"` 추가(`0007_sturdy_ultimo.sql`), 영상이 연결된 항목 삭제 → 200 + `demo_videos` 행도 함께 삭제됨을 실제로 재현해 확인.
  3. Range 접미사 범위(`bytes=-N`, "파일 끝에서 N바이트")가 `bytes=N-`과 동일하게(start=0) 잘못 처리됨(P2) — 분기 로직 수정, `Range: bytes=-100`(2048바이트 파일)이 `Content-Range: bytes 1948-2047/2048`로 정확히 응답함을 확인. 빈 범위(`bytes=-`) 400/416 처리도 함께 보강.
- **코덱스 리뷰 2차**(PR #6) — 1건, 실제 결함:
  1. blob 경로에서 `upload()` 응답 직후 단 한 번만 `router.refresh()`하면 `onUploadCompleted` 웹훅(비동기, 별도 요청)이 아직 DB에 반영되기 전 상태를 보여줄 수 있음(P1) — 완벽한 보장은 불가능(로컬은 웹훅 자체가 안 옴)하지만, 웹훅이 도착할 시간을 벌기 위해 1초/2초/2초 간격으로 최대 3회 추가 새로고침하도록 개선. `video-upload.tsx`만 수정(서버 라우트 변경 없음, UI 전용 완화).
- **코덱스 리뷰 3차**(PR #6) — 1건, 실제 결함(2차 수정의 잔여 한계를 정확히 지적):
  1. 고정 시간(1+2+2초) 새로고침으로는 웹훅이 5초보다 늦게 도착하면 "성공했지만 계속 낡은 상태로 보임"이 발생함(P2) — 새 GET `/api/templates/[hallId]/items/[itemId]/video/status` 엔드포인트(admin 전용, 현재 `videoUrl` 반환)를 추가해 실제 반영 여부를 폴링(1초 간격, 최대 15초)하고, **반영이 확인된 시점에만** `router.refresh()`. 15초 내 확인 안 되면 "업로드는 완료됐지만 아직 반영되지 않았어요" 안내로 정직하게 알림(성공을 가장하지 않음 — DESIGN.md "관련 사례 없음" 원칙과 동일 정신). `VideoUpload`에 `currentVideoUrl` prop 추가해 "새 영상인지" 판별.
- Task 1~9 전 항목 구현. Task 9 중 `@vercel/blob` 경로의 종단 검증만 로컬 환경 한계로 인해 완료하지 못함(위 Debug Log 참고) — 이 항목은 실제 Vercel 배포 + Blob store 프로비저닝 시점으로 명시적으로 인계.
- 로컬/프로덕션 듀얼 스토리지 전략을 `isBlobStorageConfigured()` 단일 분기점으로 구현: `BLOB_READ_WRITE_TOKEN` 존재 여부에 따라 클라이언트가 `@vercel/blob/client`의 `upload()` 또는 일반 `fetch` POST 중 하나를 선택. 토큰이 나중에 설정돼도 코드 변경 없이 AD-4 경로로 자동 전환됨(로컬로 이미 저장된 영상도 `storageProvider: "local"`로 계속 서빙되어 두 provider가 영구 공존).
- AC 1: 로컬 폴백 업로드 → `demo_videos` 행 생성(`storage_provider: local`) → 페이지에 `<video controls>` 렌더 확인. `@vercel/blob` 경로는 코드 완성, 종단 검증은 배포 이후로 인계(§ Debug Log).
- AC 2: `GET /api/local-videos/<file>` 200(전체) / 206(`Range` 헤더 있을 때, `Content-Range` 포함) 확인 — HTML5 `<video>`의 탐색(seek) 지원에 필요한 Range 요청 처리 검증.
- AC 3: `text/plain` 업로드 → 400 `invalid_type`. 500MB+1바이트 실제 버퍼 업로드 → 400 `too_large`. 둘 다 클라이언트 사전 검증과 별개로 서버가 진짜로 거부함을 확인(서버가 실제 안전장치).
- AC 4: 영상 없이 항목 생성(Story 1.3 `createTemplateItemAction` 그대로 재사용, 이 스토리에서 수정 안 함) → 정상 저장, "영상 없음" 안내 표시 확인 — 두 기능이 완전히 분리되어 있음을 실증.
- AD-2 회귀: 1층 홀 소속 항목 id를 2층 홀의 `hallId`로 조합해 업로드 시도 → 404, DB에 행 생성 안 됨 확인.
- AD-3: operator 세션으로 업로드 라우트 직접 POST → `requireAdminSession()` throw로 차단, DB에 행 생성 안 됨 확인.
- path traversal(`..%2f..%2fpackage.json`) → 404 확인.
- `npm run lint`(0 errors), `npx tsc --noEmit`(clean), `npm run build`(성공, 신규 라우트 4개 모두 빌드 결과에 포함: `/api/local-videos/[fileName]`, `/api/templates/[hallId]/items/[itemId]/video/{local,blob}`) 모두 통과.

### File List

- NEW `apps/web/lib/storage/video-storage.ts`
- NEW `apps/web/lib/storage/local-video-store.ts`
- NEW `apps/web/lib/db/repositories/demo-video.ts`
- NEW `apps/web/lib/services/demo-video.ts`
- NEW `apps/web/app/api/local-videos/[fileName]/route.ts`
- NEW `apps/web/app/api/templates/[hallId]/items/[itemId]/video/local/route.ts`
- NEW `apps/web/app/api/templates/[hallId]/items/[itemId]/video/blob/route.ts`
- NEW `apps/web/app/api/templates/[hallId]/items/[itemId]/video/status/route.ts` (코덱스 3차 P2 — blob 웹훅 반영 확인용 폴링 엔드포인트)
- NEW `apps/web/app/admin/templates/[hallId]/video-upload.tsx`
- NEW `apps/web/drizzle/0006_flawless_korvac.sql`
- NEW `apps/web/drizzle/meta/0006_snapshot.json`
- NEW `apps/web/drizzle/0007_sturdy_ultimo.sql` (코덱스 1차 P1 — `templateItemId` FK `ON DELETE cascade`)
- NEW `apps/web/drizzle/meta/0007_snapshot.json`
- MODIFIED `apps/web/lib/db/schema.ts` (`demoVideos` 테이블 추가)
- MODIFIED `apps/web/drizzle/meta/_journal.json`
- MODIFIED `apps/web/app/admin/templates/[hallId]/page.tsx` (영상 데이터 fetch + prop 전달)
- MODIFIED `apps/web/app/admin/templates/[hallId]/template-item-row.tsx` (영상 표시/업로드 통합)
- MODIFIED `apps/web/app/admin/templates/[hallId]/templates.css` (비디오 블록 스타일)
- MODIFIED `apps/web/package.json` / `apps/web/package-lock.json` (`@vercel/blob` 추가)
- MODIFIED `apps/web/.env.local.example` (`BLOB_READ_WRITE_TOKEN` 문서화)
- MODIFIED `apps/web/.gitignore` (`.local-blob/` 제외)
