---
baseline_commit: 4fb2af536dc31829ca4dd195a2ef1ce011d9f77f
---

# Story 1.4: 시연 영상 업로드 및 연결

Status: ready-for-dev

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

- [ ] Task 1: `demo_videos` 테이블 스키마 + 마이그레이션 (AC: 1, 2, 3)
  - [ ] `lib/db/schema.ts`에 `demoVideos` 테이블 추가: `id`(uuid, `defaultRandom()`, PK), `hallId`(uuid, not null, `references(() => halls.id)` — AD-2 홀 종속 엔티티, 스파인이 `demo_videos`를 명시적으로 홀 종속 목록에 포함시킴), `templateItemId`(uuid, not null, `references(() => checklistTemplateItems.id)`, **unique 제약** — 항목당 영상 슬롯은 1개, 아래 "[ASSUMPTION] 항목당 영상 1개" 참고), `videoUrl`(text, not null), `fileName`(text, not null — 원본 파일명, 표시용), `fileSizeBytes`(integer, not null — 500MB는 524,288,000이라 `integer`(최대 ~2.1GB) 범위 안, `bigint` 불필요), `storageProvider`(text, not null — `"vercel-blob" | "local"`, 어느 서빙 경로로 읽어야 하는지 구분), `createdAt`/`updatedAt`(halls와 동일 패턴)
  - [ ] `npx drizzle-kit generate`로 마이그레이션 생성(DB 연결 없이 스키마 diff만으로 생성됨, Story 1.1~1.3에서 확인된 방식)
  - [ ] 로컬 Postgres에 마이그레이션 적용 — `lib/db/index.ts`가 이미 `DATABASE_URL`로 자동 분기하므로 스왑 불필요(Story 1.3 Previous Story Intelligence 참고)

- [ ] Task 2: 스토리지 상수 + 로컬 파일 저장 유틸 (AC: 1, 2, 3)
  - [ ] `lib/storage/video-storage.ts`(NEW): `export function isBlobStorageConfigured(): boolean { return !!process.env.BLOB_READ_WRITE_TOKEN; }`(`lib/db/index.ts`의 `isLocalPostgres` 분기 패턴과 동일한 사상 — 인프라 유무로 구현을 스위칭), `export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;`, `export const ALLOWED_VIDEO_CONTENT_TYPE = "video/mp4";`. 이 파일은 클라이언트 컴포넌트에서도 import되므로(파일 선택 즉시 클라이언트 사이드 사전 검증용) 서버 전용 코드(`fs`, `process.env.BLOB_READ_WRITE_TOKEN` 값 자체의 노출 등)를 넣지 않는다 — `isBlobStorageConfigured()`도 서버 컴포넌트에서 호출해 그 **결과(boolean)**만 prop으로 클라이언트에 내려준다(토큰 값 자체는 클라이언트로 전달 금지).
  - [ ] `lib/storage/local-video-store.ts`(NEW, 서버 전용): `LOCAL_VIDEO_DIR = path.join(process.cwd(), ".local-blob", "demo-videos")`. `async function saveLocalVideoFile(file: File): Promise<{ url: string; fileName: string; sizeBytes: number }>` — `fs/promises`의 `mkdir(..., {recursive:true})` + `writeFile`로 저장. 저장 파일명은 `${randomUUID()}.mp4`(원본 파일명을 그대로 쓰지 않음 — 경로 조작/충돌 방지). 반환 `url`은 `/api/local-videos/${storedName}`. `export function isValidLocalVideoFileName(name: string): boolean`(Task 5용 — `^[0-9a-f-]{36}\.mp4$` 정규식, path traversal 차단)

- [ ] Task 3: 리포지토리 레이어 — `lib/db/repositories/demo-video.ts` (AC: 1, 2)
  - [ ] `upsertForTemplateItem(hallId: string, templateItemId: string, input: { videoUrl: string; fileName: string; fileSizeBytes: number; storageProvider: "vercel-blob" | "local" }): Promise<DemoVideo>` — `db.insert(demoVideos).values({hallId, templateItemId, ...input}).onConflictDoUpdate({ target: demoVideos.templateItemId, set: {...} }).returning()`. **`db.transaction()`을 쓰지 않는다** — `ON CONFLICT`는 단일 SQL 문이라 원자적이며 `node-postgres`/`neon-http` 양쪽에서 동일하게 동작한다(Story 1.3 코덱스 4차 P1 교훈 재적용: 트랜잭션은 프로덕션 드라이버에서 무조건 throw). Story 1.3의 재시도 래퍼(`withConcurrencyRetry`)는 여기서 불필요 — UNIQUE 충돌이 애초에 발생하지 않는 단일 UPSERT 문이라 재시도할 대상이 없다(과잉 적용 금지).
  - [ ] `findByTemplateItemIds(hallId: string, templateItemIds: string[]): Promise<DemoVideo[]>` — `templateItemIds.length === 0`이면 빈 배열 즉시 반환(빈 `IN ()` 방지). `WHERE hall_id = $hallId AND template_item_id IN (...)`(AD-2)
  - [ ] 모든 함수 첫 인자 `hallId`(AD-2)

- [ ] Task 4: 서비스 레이어 — `lib/services/demo-video.ts` (AC: 1, 2, 3)
  - [ ] `DemoVideoValidationError extends Error`(Story 1.2/1.3과 동일 패턴)
  - [ ] `async function assertTemplateItemOwnedByHall(hallId: string, templateItemId: string): Promise<void>` — `templateItemRepo.findById(hallId, templateItemId)`(Story 1.3이 이미 hallId+id 복합 WHERE로 구현해둔 함수를 그대로 재사용) 결과가 없으면 `DemoVideoValidationError` throw. 이것이 AD-2의 "2-hop 재검증"에 해당 — `templateItemId`만으로 신뢰하지 않고 그 항목이 실제로 `hallId` 소속인지 서버가 직접 재확인한다(다른 홀의 `templateItemId`를 넣어 그 홀 항목에 영상을 심는 것을 차단).
  - [ ] `async function saveDemoVideo(hallId, templateItemId, input): Promise<DemoVideo>` — `assertTemplateItemOwnedByHall` 통과 후 `repo.upsertForTemplateItem(hallId, templateItemId, input)` 위임. **파일 형식/크기 서버 검증은 이 함수의 책임이 아니다** — 두 업로드 경로(local/blob)가 저장 방식이 근본적으로 다르므로 각 Route Handler가 자신의 경로에 맞는 방식으로 검증한다(Task 6). 이 함수는 "이미 검증되고 저장 완료된 파일의 메타데이터를 DB에 기록"만 한다.
  - [ ] `async function listDemoVideosByItems(hallId, templateItemIds): Promise<DemoVideo[]>` — 리포지토리 위임(페이지 렌더링용)

- [ ] Task 5: 로컬 영상 서빙 Route Handler (AC: 2 — 로컬 폴백 모드에서만 동작)
  - [ ] `app/api/local-videos/[fileName]/route.ts`(NEW): `GET` 핸들러. `params.fileName`을 `isValidLocalVideoFileName()`으로 검증(불일치 시 404 — path traversal 차단). 파일을 `fs`로 읽어 `Content-Type: video/mp4`로 응답. **Range 요청 지원 필수** — HTML5 `<video>`는 재생/탐색(seek) 시 브라우저가 `Range` 헤더를 보낸다; 이를 무시하면 재생 자체는 되어도 탐색(스크럽)이 깨진다. `request.headers.get("range")`가 있으면 `fs.createReadStream(path, {start, end})` + `206 Partial Content` + `Content-Range`/`Accept-Ranges` 헤더로 응답, 없으면 전체 스트림 + `200`.
  - [ ] 이 라우트는 `isBlobStorageConfigured() === false`일 때만 실제로 참조되지만, 라우트 자체는 항상 존재해도 무방(토큰이 나중에 생겨도 기존에 로컬로 저장된 영상은 계속 이 라우트로 서빙됨 — 마이그레이션 없이 공존 가능)

- [ ] Task 6: 업로드 Route Handler 2종 (AC: 1, 2, 3)
  - [ ] `@vercel/blob` 패키지 설치(`npm install @vercel/blob` — 아키텍처 스파인 §Stack이 이미 승인한 의존성, 신규 승인 불필요)
  - [ ] `app/api/templates/[hallId]/items/[itemId]/video/local/route.ts`(NEW): `POST` — 로컬 폴백 전용. 순서: `requireAdminSession()` → `hallId`/`itemId`가 `isValidUuid`가 아니면 400 → `assertTemplateItemOwnedByHall(hallId, itemId)` 실패 시 404 → `request.formData()`에서 `file` 추출(없으면 400) → **서버 사이드 검증**: `file.type !== ALLOWED_VIDEO_CONTENT_TYPE` 또는 `file.size > MAX_VIDEO_SIZE_BYTES`면 400 + `{ error: { code, message } }`(스파인 §Consistency Conventions의 에러 응답 봉투 형식) → `saveLocalVideoFile(file)` → `saveDemoVideo(hallId, itemId, { videoUrl, fileName, fileSizeBytes: sizeBytes, storageProvider: "local" })` → `revalidatePath(\`/admin/templates/${hallId}\`)` → `200 { ok: true }`
  - [ ] `app/api/templates/[hallId]/items/[itemId]/video/blob/route.ts`(NEW): `POST` — `@vercel/blob/client`의 `handleUpload()` 사용(정확한 시그니처는 아래 "라이브러리/최신 기술 정보" 참고, 반드시 이 문서대로 구현 — 학습 데이터의 옛 API와 다를 수 있음).
    - `onBeforeGenerateToken(pathname, clientPayload)`: `requireAdminSession()` → 실패 시 throw(핸들러가 401 상당으로 처리). `hallId`/`itemId`는 라우트 URL 세그먼트에서 가져와 `isValidUuid` + `assertTemplateItemOwnedByHall` 검증(토큰 발급 이전에 반드시 통과해야 함 — AD-4가 명시하는 "신뢰할 수 없는 클라이언트 입력으로 홀 격리를 우회"를 막는 지점이 바로 여기). `clientPayload`(클라이언트가 `upload()` 호출 시 넘긴 문자열, Task 7에서 `JSON.stringify({fileSize: file.size})`로 채움)를 파싱해 `fileSize`를 꺼내 `tokenPayload`에 `{hallId, templateItemId: itemId, fileSize}`로 다시 실어보낸다(다음 콜백에 전달할 유일한 방법). 반환값: `{ allowedContentTypes: [ALLOWED_VIDEO_CONTENT_TYPE], maximumSizeInBytes: MAX_VIDEO_SIZE_BYTES, addRandomSuffix: true, tokenPayload: JSON.stringify({hallId, templateItemId: itemId, fileSize}) }` — `maximumSizeInBytes`/`allowedContentTypes`는 Vercel Blob 인프라가 업로드 자체를 거부하게 만드는 서버 사이드 강제이며(AC 3), 클라이언트 사전 검증(Task 7)과 별개로 반드시 있어야 하는 진짜 안전장치다.
    - `onUploadCompleted({ blob, tokenPayload })`: `JSON.parse(tokenPayload)`로 `hallId`/`templateItemId`/`fileSize` 복원 → `saveDemoVideo(hallId, templateItemId, { videoUrl: blob.url, fileName: blob.pathname, fileSizeBytes: fileSize, storageProvider: "vercel-blob" })`. **`fileSize`는 클라이언트가 `clientPayload`로 보고한 값이며 `PutBlobResult`(`blob`)에는 `size` 필드가 없다** — 서버가 진짜 크기를 재확인하려면 `@vercel/blob`의 `head(blob.url)`을 호출해 `size`를 얻어 그 값을 대신 저장할 것(권장 — AD-4가 "클라이언트가 보고하는 값을 그대로 신뢰해 저장하는 경로 금지"라고 명시한 원칙을 크기 필드에도 동일하게 적용). 이 콜백의 실패(throw)는 Vercel이 최대 5회 재시도하므로 `saveDemoVideo` 실패 시 그냥 throw하면 됨(별도 재시도 로직 불필요).
    - **로컬 개발에서 이 콜백은 절대 호출되지 않는다**(Vercel Blob이 `localhost`에 도달 불가 — ngrok 등 터널링 필요, 공식 문서 명시 사항). 이 스토리 범위에서는 ngrok 설정을 하지 않으므로 blob 경로는 코드만 완성하고 실제 종단 검증은 프로덕션 배포 이후로 미룬다(아래 "테스트 요구사항" 참고) — **이것이 로컬 폴백 경로가 단순히 "토큰 없을 때의 임시방편"이 아니라 "로컬에서 실제로 검증 가능한 유일한 경로"인 이유**다.

- [ ] Task 7: 업로드 UI 컴포넌트 + 항목 카드 통합 (AC: 1, 2, 3, 4)
  - [ ] `app/admin/templates/[hallId]/video-upload.tsx`(NEW, Client Component): props `{ hallId: string; templateItemId: string; blobEnabled: boolean }`. 파일 `<input type="file" accept="video/mp4">` + "업로드" 버튼. 제출 시:
    1. 클라이언트 사전 검증(즉각 피드백용, 서버 검증의 대체 아님): `file.type !== "video/mp4" || file.size > MAX_VIDEO_SIZE_BYTES`면 네트워크 요청 없이 즉시 `1px solid #E0353B` + 12px 헬퍼 텍스트로 거부 이유 표시(UX-DR14, "mp4 형식, 500MB 이하 파일만 업로드할 수 있어요"류 — DESIGN.md §10 톤, 사용자 탓하지 않기)
    2. `blobEnabled`면 `upload(file.name, file, { access: "public", handleUploadUrl: \`/api/templates/${hallId}/items/${templateItemId}/video/blob\`, clientPayload: JSON.stringify({ fileSize: file.size }) })`(`@vercel/blob/client`의 `upload` 함수) 호출 후 "업로드 완료, 목록에 반영 중..." 안내(§14 Loading 상태 톤) — `onUploadCompleted` 웹훅이 이 응답 이후 별도로 도착하므로 즉시 `router.refresh()`해도 영상이 바로 안 보일 수 있음(Task 6 blob 경로 설명 참고, 알려진 v1 한계로 Dev Notes에 기록)
    3. 아니면(`blobEnabled === false`) `fetch(\`/api/templates/${hallId}/items/${templateItemId}/video/local\`, { method: "POST", body: formData })` 호출
    4. 성공 시 `useRouter().refresh()`(Server Action이 아닌 일반 `fetch`라 `revalidatePath`만으로는 이미 마운트된 클라이언트 트리가 자동 갱신되지 않음 — 명시적으로 호출해야 함). 실패 시 서버가 반환한 `{error:{message}}`를 UX-DR14 스타일로 표시(조용한 토스트 금지, 즉시 드러나는 알림)
    5. 업로드 중에는 버튼 너비 유지 + 버튼 내 스피너로 중복 제출 방지(UX-DR13, Story 3.x 질의 버튼과 동일 원칙 — 이 스토리에서 처음 적용)
  - [ ] `app/admin/templates/[hallId]/template-item-row.tsx`(UPDATE): props에 `demoVideo?: { videoUrl: string; fileName: string } , blobEnabled: boolean` 추가. 카드 본문 하단에: `demoVideo`가 있으면 `<video controls src={demoVideo.videoUrl} />` + "다시 업로드" 문구의 `<VideoUpload>`(재업로드는 업서트라 기존 영상을 교체함, 별도 삭제 UI 없음 — Deferred 참고), 없으면 "영상 없음" 안내 + `<VideoUpload>`만 표시
  - [ ] `app/admin/templates/[hallId]/page.tsx`(UPDATE): `listDemoVideosByItems(hallId, items.map(i => i.id))` 호출 → `Map<templateItemId, DemoVideo>` 구성 → 각 `TemplateItemRow`에 `demoVideo={videoByItemId.get(item.id)}` 전달. `isBlobStorageConfigured()`를 서버에서 한 번 호출해 `blobEnabled` boolean만 클라이언트로 내려보냄(토큰 값 자체는 절대 클라이언트로 넘기지 않음).
  - [ ] `templates.css`(UPDATE): `.template-item-card__video`(비디오 블록 wrapper), `.template-item-card video`(`max-width: 100%`, `border-radius: 8px`), 업로드 폼/에러 스타일은 기존 `.field-error`/`.input--error` 클래스 재사용(Story 1.2/1.3에서 이미 정의됨 — 새로 만들지 말 것)

- [ ] Task 8: 환경 설정 문서화 (AC: 1)
  - [ ] `.env.local.example`(UPDATE): `BLOB_READ_WRITE_TOKEN=""` 항목 추가, 주석으로 "비워두면 로컬 파일시스템 폴백 사용(Story 1.4), Vercel Blob store 생성 후 채우면 자동으로 AD-4 경로로 전환" 명시
  - [ ] `apps/web/.gitignore`(UPDATE): `.local-blob/` 추가(로컬 업로드 테스트 파일이 git에 커밋되는 것 방지 — 실제 mp4 바이너리가 저장되므로 반드시 필요)

- [ ] Task 9: 수동 검증 (AC: 1, 2, 3, 4)
  - [ ] 로컬 폴백 경로로 mp4 파일 업로드 → `demo_videos` 행 생성 확인(`psql`) → 항목 조회 시 `<video>` 재생 확인(AC 1 로컬 예외 경로, AC 2)
  - [ ] mp4가 아닌 파일(예: `.txt`를 `.mp4`로 리네임하지 않은 실제 다른 MIME) 업로드 시도 → 클라이언트 사전 검증 및/또는 서버 400 확인, DB 행 생성 안 됨 확인(AC 3)
  - [ ] 500MB 초과 파일 업로드 시도 → 거부 확인(대용량 실파일 준비가 부담되면 `MAX_VIDEO_SIZE_BYTES`를 테스트 중 임시로 낮춰 로직만 검증하고 원복 — 실제 커밋에는 500MB 유지)
  - [ ] 영상 없이 Task 1(Story 1.3) 항목 생성/수정 → 정상 저장, 에러 없음 확인(AC 4, 회귀 없음)
  - [ ] AD-2 회귀: A홀 소속 `templateItemId`를 B홀의 `hallId` URL 세그먼트와 조합해 업로드 라우트 직접 호출 → 404/차단 확인
  - [ ] operator 세션으로 두 업로드 라우트 직접 POST → 차단 확인(AD-3, `requireAdminSession()`이 두 라우트 모두에서 첫 줄에 호출되는지 코드 확인 + 실제 요청으로 검증)
  - [ ] `@vercel/blob` 경로(Task 6 blob route)는 **실제 Vercel 배포 + Blob store 프로비저닝 이후에만** 종단 검증 가능(로컬에서는 `onUploadCompleted`가 도달하지 않음) — 이 스토리는 코드 완성 + 로컬 경로 종단 검증까지를 완료 기준으로 하고, blob 경로 실사용 검증은 다음 배포 스토리(또는 인프라 준비 시점)로 인계한다. **이 인계 사항을 Dev Agent Record에 명시적으로 남길 것.**
  - [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` 통과 확인

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
    onBeforeGenerateToken: async (pathname, clientPayload) => {
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

### Debug Log References

### Completion Notes List

### File List
