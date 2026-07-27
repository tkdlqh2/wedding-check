"use client";

import { useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "@/lib/operator/checklist-cache";

const POLL_INTERVAL_MS = 60_000;

const ceremonyDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Story 5.5: 항목의 최소 단위가 단계에서 체크리스트 항목으로 내려갔다 — title이
// POS Tile 라벨(체크 대상)이고, stepName은 그룹핑 헤더로만 쓰인다.
export type OperatorItem = {
  id: string;
  stepName: string;
  title: string;
  description: string | null;
  sortOrder: number;
};

export type OperatorCeremony = {
  id: string;
  ceremonyAt: string;
  contractConditions: Record<string, boolean>;
};

type ApiSuccessResponse = {
  ceremony: OperatorCeremony;
  items: OperatorItem[];
};

// 서버가 이미 (단계 순서, 항목 순서)로 정렬해서 items를 준다 — 순서를 유지한 채
// 연속된 같은 stepName끼리만 묶는 순차 그룹핑이면 충분하다(재정렬 불필요).
function groupItemsByStep(items: OperatorItem[]): [string, OperatorItem[]][] {
  const groups: [string, OperatorItem[]][] = [];
  for (const item of items) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0] === item.stepName) {
      lastGroup[1].push(item);
    } else {
      groups.push([item.stepName, [item]]);
    }
  }
  return groups;
}

export function ChecklistInstanceView({
  hallId,
  ceremonyId,
  hallName,
  initialCeremony,
  initialItems,
}: {
  hallId: string;
  ceremonyId: string;
  hallName: string;
  initialCeremony: OperatorCeremony;
  initialItems: OperatorItem[];
}) {
  const [ceremony, setCeremony] = useState(initialCeremony);
  const [items, setItems] = useState(initialItems);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isOffline, setIsOffline] = useState(false);
  // 오프라인(연결 자체 실패)과 구분되는 온라인 상태의 서버 오류(코덱스 리뷰 1차 P2) —
  // 이 경우 캐시로 조용히 되돌아가지 않고 별도로 표시한다. 세션 만료(401)만 로그인으로
  // 리다이렉트하고, 나머지(404/500 등)는 마지막 화면을 유지한 채 오류만 알린다.
  const [hasError, setHasError] = useState(false);

  // 최초 로드(SSR)로 받은 데이터를 즉시 캐시에 기록 — AD-5 "최초 로드 성공 시 캐시" 요건.
  // 이 write-through 이후부터 오프라인 폴백이 의미를 갖는다.
  useEffect(() => {
    writeCache(ceremonyId, { ceremony: initialCeremony, items: initialItems });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceremonyId]);

  useEffect(() => {
    function handleOffline() {
      setIsOffline(true);
    }
    function handleOnline() {
      setIsOffline(false);
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // 코덱스 리뷰 5차 P2: 요청이 60초보다 오래 걸리면(불안정한 홀 와이파이 — 이 스토리가
  // 다루는 바로 그 상황) setInterval이 다음 요청을 겹쳐서 보낸다. 나중에 시작한 요청이
  // 먼저 끝나 최신 데이터를 반영했는데, 그 뒤에 늦게 도착한 이전 요청의 응답이 그
  // 최신 상태를 다시 낡은 값으로 덮어쓸 수 있었다 — 요청마다 순번을 매겨, 자신이 시작된
  // 이후 더 최신 요청이 시작됐다면 자신의 결과를 state/캐시에 반영하지 않고 버린다.
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function revalidate() {
      const requestId = ++latestRequestIdRef.current;
      const isStale = () => cancelled || requestId !== latestRequestIdRef.current;

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!isStale()) {
          setIsOffline(true);
          setHasError(false);
        }
        return;
      }

      let res: Response;
      try {
        res = await fetch(`/api/operator/ceremonies/${hallId}/${ceremonyId}`, {
          cache: "no-store",
        });
      } catch {
        // fetch 자체가 throw하는 경우만 실제 연결 실패(오프라인)다 — 캐시로 폴백한다(AD-5).
        if (isStale()) return;
        const cached = readCache(ceremonyId);
        if (cached) {
          setCeremony(cached.ceremony);
          setItems(cached.items);
        }
        setIsOffline(true);
        setHasError(false);
        return;
      }

      if (isStale()) return;

      if (res.status === 401) {
        // 세션 만료 — 캐시된 데이터를 계속 보여주는 것은 이미 접근 권한이 없는 데이터를
        // 노출하는 것과 같다. 오프라인으로 오인하지 않고 즉시 로그인 화면으로 보낸다.
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        // 온라인 상태에서의 실제 서버 오류(404/500 등) — 오프라인이 아니므로 캐시로
        // 조용히 되돌아가지 않는다. 마지막으로 성공한 화면은 그대로 유지하고 오류만 알린다.
        setIsOffline(false);
        setHasError(true);
        return;
      }

      const data: ApiSuccessResponse = await res.json();
      if (isStale()) return;
      setCeremony(data.ceremony);
      setItems(data.items);
      setIsOffline(false);
      setHasError(false);
      writeCache(ceremonyId, { ceremony: data.ceremony, items: data.items });
    }

    const intervalId = window.setInterval(revalidate, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hallId, ceremonyId]);

  function toggleSelected(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  return (
    <div className="checklist-instance-view">
      <h1>
        {hallName} · {ceremonyDateFormatter.format(new Date(ceremony.ceremonyAt))}
      </h1>

      {isOffline ? (
        <p className="checklist-instance-view__offline-banner" role="status">
          오프라인 상태입니다 — 마지막으로 불러온 체크리스트를 계속 볼 수 있어요.
        </p>
      ) : null}

      {hasError ? (
        <p className="checklist-instance-view__error-banner" role="status">
          새로고침에 실패했습니다 — 화면은 그대로 유지됩니다. 잠시 후 다시 확인해주세요.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="checklist-instance-view__empty">포함된 항목이 없습니다.</p>
      ) : (
        groupItemsByStep(items).map(([stepName, stepItems]) => (
          <section key={stepName} className="checklist-step-group">
            <h2 className="checklist-step-group__name">{stepName}</h2>
            <ul className="checklist-tile-grid">
              {stepItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      "checklist-tile" + (selectedIds.has(item.id) ? " checklist-tile--selected" : "")
                    }
                    onClick={() => toggleSelected(item.id)}
                    aria-pressed={selectedIds.has(item.id)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
