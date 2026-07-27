"use client";

import { useEffect, useState } from "react";
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

export type OperatorItem = {
  id: string;
  stepName: string;
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

  useEffect(() => {
    let cancelled = false;

    async function revalidate() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) setIsOffline(true);
        return;
      }
      try {
        const res = await fetch(`/api/operator/ceremonies/${hallId}/${ceremonyId}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`요청 실패: ${res.status}`);
        const data: ApiSuccessResponse = await res.json();
        if (cancelled) return;
        setCeremony(data.ceremony);
        setItems(data.items);
        setIsOffline(false);
        writeCache(ceremonyId, { ceremony: data.ceremony, items: data.items });
      } catch {
        if (cancelled) return;
        // 재검증 실패 시 마지막으로 성공한 캐시로 폴백 — 기존 화면을 비우지 않는다(AD-5).
        const cached = readCache(ceremonyId);
        if (cached) {
          setCeremony(cached.ceremony);
          setItems(cached.items);
        }
        setIsOffline(true);
      }
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

      {items.length === 0 ? (
        <p className="checklist-instance-view__empty">포함된 항목이 없습니다.</p>
      ) : (
        <ul className="checklist-tile-grid">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={
                  "checklist-tile" + (selectedIds.has(item.id) ? " checklist-tile--selected" : "")
                }
                onClick={() => toggleSelected(item.id)}
                aria-pressed={selectedIds.has(item.id)}
              >
                {item.stepName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
