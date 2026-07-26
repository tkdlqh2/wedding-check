// Story 1.4 로컬/프로덕션 듀얼 스토리지 전략([ASSUMPTION]) — lib/db/index.ts의
// isLocalPostgres 분기와 같은 사상: 인프라(BLOB_READ_WRITE_TOKEN) 유무로 업로드
// 경로 자체를 스위칭한다. 클라이언트 컴포넌트에서도 import되므로 서버 전용 코드는
// 두지 않는다 — isBlobStorageConfigured()의 boolean 결과값만 서버에서 클라이언트로
// prop으로 내려보내고, 토큰 값 자체는 절대 클라이언트에 노출하지 않는다.

export function isBlobStorageConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// PRD FR-3 [ASSUMPTION]: 형식 mp4, 파일당 500MB 상한.
export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
export const ALLOWED_VIDEO_CONTENT_TYPE = "video/mp4";
