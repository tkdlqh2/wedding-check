export type CachedOperatorItem = {
  id: string;
  stepName: string;
  description: string | null;
  sortOrder: number;
};

export type CachedOperatorInstanceView = {
  ceremony: { id: string; ceremonyAt: string; contractConditions: Record<string, boolean> };
  items: CachedOperatorItem[];
  cachedAt: string;
};

const CACHE_KEY_PREFIX = "wedding-check:operator-checklist:";

function cacheKey(ceremonyId: string): string {
  return `${CACHE_KEY_PREFIX}${ceremonyId}`;
}

// localStorage 읽기 실패(손상된 JSON, 접근 불가 등)는 조회 자체를 막아서는 안 된다 —
// 조용히 null을 반환하고 호출부가 "캐시 없음"으로 처리한다(AD-5).
export function readCache(ceremonyId: string): CachedOperatorInstanceView | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(ceremonyId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedOperatorInstanceView;
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
