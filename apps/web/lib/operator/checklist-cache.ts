export type CachedOperatorItem = {
  id: string;
  templateItemId: string | null;
  // 실행 화면 재구성(2026-07-27): ad-hoc 단계 그룹핑 키 + "상세" 펼침의 시연 영상 URL.
  adHocGroupRootId: string | null;
  stepName: string;
  title: string;
  description: string | null;
  sortOrder: number;
  videoUrl: string | null;
};

export type CachedOperatorCeremony = {
  id: string;
  ceremonyAt: string;
  contractConditions: Record<string, boolean>;
  groomName: string | null;
  brideName: string | null;
  // 예식 진행 상태(오퍼레이터가 직접 변경, ceremonies.status 저장 필드).
  status: string;
};

export type CachedOperatorInstanceView = {
  ceremony: CachedOperatorCeremony;
  items: CachedOperatorItem[];
  cachedAt: string;
};

const CACHE_KEY_PREFIX = "wedding-check:operator-checklist:";

function cacheKey(ceremonyId: string): string {
  return `${CACHE_KEY_PREFIX}${ceremonyId}`;
}

// 코덱스 리뷰 1차 P2: 문법적으로는 유효한 JSON이지만 기대하는 셰이프가 아닌 값(예: 이전
// 앱 버전이 남긴 캐시, `{}`)이 그대로 반환되면 호출부가 ceremony/items를 undefined로
// 다루다 렌더링 중 크래시한다 — 필수 필드를 런타임에 검증하고 어긋나면 null로 취급한다.
// 코덱스 리뷰 4차 P2: 최상위 셰이프만 확인하면 items 배열 안의 개별 원소(예: null,
// stepName 누락)나 유효하지 않은 ceremonyAt(Intl.DateTimeFormat이 Invalid Date에
// throw함)은 여전히 통과해 렌더링 중 크래시할 수 있었다 — 항목 하나하나와 날짜까지
// 검증한다.
function isValidCachedItem(value: unknown): value is CachedOperatorItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    (item.templateItemId === null || typeof item.templateItemId === "string") &&
    (item.adHocGroupRootId === null || typeof item.adHocGroupRootId === "string") &&
    typeof item.stepName === "string" &&
    typeof item.title === "string" &&
    (item.description === null || typeof item.description === "string") &&
    typeof item.sortOrder === "number" &&
    (item.videoUrl === null || typeof item.videoUrl === "string")
  );
}

// 셰이프가 바뀌면(2026-07-27 실행 화면 재구성: adHocGroupRootId/videoUrl/신랑신부 추가)
// 이전 앱 버전이 남긴 캐시는 검증에서 탈락해 "캐시 없음"으로 처리된다 — 의도된 동작
// (다음 온라인 폴링/최초 로드가 새 셰이프로 다시 write-through한다).
function isValidCachedShape(value: unknown): value is CachedOperatorInstanceView {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!v.ceremony || typeof v.ceremony !== "object") return false;
  const ceremony = v.ceremony as Record<string, unknown>;
  if (typeof ceremony.id !== "string" || typeof ceremony.ceremonyAt !== "string") return false;
  if (Number.isNaN(new Date(ceremony.ceremonyAt).getTime())) return false;
  if (ceremony.groomName !== null && typeof ceremony.groomName !== "string") return false;
  if (ceremony.brideName !== null && typeof ceremony.brideName !== "string") return false;
  if (typeof ceremony.status !== "string") return false;
  return Array.isArray(v.items) && v.items.every(isValidCachedItem);
}

// localStorage 읽기 실패(손상된 JSON, 접근 불가 등)는 조회 자체를 막아서는 안 된다 —
// 조용히 null을 반환하고 호출부가 "캐시 없음"으로 처리한다(AD-5).
export function readCache(ceremonyId: string): CachedOperatorInstanceView | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(ceremonyId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidCachedShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCache(
  ceremonyId: string,
  data: Omit<CachedOperatorInstanceView, "cachedAt">,
): void {
  try {
    const payload: CachedOperatorInstanceView = { ...data, cachedAt: new Date().toISOString() };
    window.localStorage.setItem(cacheKey(ceremonyId), JSON.stringify(payload));
  } catch {
    // 용량 초과, 시크릿 모드 등으로 쓰기가 실패해도 화면 자체는 계속 동작해야 한다.
  }
}
