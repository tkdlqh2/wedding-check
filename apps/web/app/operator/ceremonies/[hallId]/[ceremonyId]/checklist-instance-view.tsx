"use client";

import { useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "@/lib/operator/checklist-cache";
import { StepFeedback } from "./step-feedback";
import { isValidUuid } from "@/lib/uuid";
import {
  asCeremonyStatus,
  nextCeremonyStatus,
  CEREMONY_STATUS_LABELS,
} from "@/lib/ceremony-status";

const POLL_INTERVAL_MS = 60_000;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const CONTRACT_LABELS: Record<string, string> = {
  requiresOfficiant: "주례 있음",
  hasAdditionalEvent: "이벤트 추가",
};

// 서버·클라이언트 필드명 항상 동일 유지(Story 2.3 코덱스 리뷰 4차 P1 — 폴링 API가
// getOperatorInstanceView를 그대로 JSON 직렬화하므로 DB 컬럼 camelCase 그대로 쓴다).
export type OperatorItem = {
  id: string;
  templateItemId: string | null;
  adHocGroupRootId: string | null;
  stepName: string;
  title: string;
  description: string | null;
  sortOrder: number;
  videoUrl: string | null;
};

export type OperatorCeremony = {
  id: string;
  ceremonyAt: string;
  contractConditions: Record<string, boolean>;
  groomName: string | null;
  brideName: string | null;
  // 예식 진행 상태 — 오퍼레이터가 아래 예식 시작/종료 버튼으로 직접 변경한다.
  status: string;
};

type ApiSuccessResponse = {
  ceremony: OperatorCeremony;
  items: OperatorItem[];
};

// 서버가 이미 (단계 순서, 항목 순서)로 정렬해서 items를 준다 — 순서를 유지한 채
// 연속된 같은 그룹핑 키끼리만 묶는 순차 그룹핑(admin group-by-step.ts와 동일한 3단
// 위계: 템플릿 단계 → ad-hoc 단계 → orphan 항목별 고유 키).
function groupItemsByStep(items: OperatorItem[]): [string, OperatorItem[]][] {
  const groupKey = (item: OperatorItem) =>
    item.templateItemId ?? item.adHocGroupRootId ?? `orphan:${item.id}`;
  const groups: [string, OperatorItem[]][] = [];
  for (const item of items) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0] === groupKey(item)) {
      lastGroup[1].push(item);
    } else {
      groups.push([groupKey(item), [item]]);
    }
  }
  return groups;
}

// prototype/js/screens/RunScreen.js 전면 이식(2026-07-27 대표 지시) — 예식 헤더 카드
// (날짜·홀 / 시간+신랑신부 / 계약 칩+상태 배지 / 체크 진행 N/M) + 단계 아코디언
// (번호 배지, 단계별 진행, 완료 시 초록) + 항목별 원형 체크 버튼 + "상세" 펼침
// (설명 전문 + 시연 영상 재생). 체크 상태는 클라이언트 로컬(스키마에 완료 필드 없음,
// Story 2.3 Dev Notes) — 탭 즉시 반영(모션 없음, DESIGN.md §15 motion-instant).
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
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set());
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  // 예식 종료 후 피드백 섹션에서 선택된 단계 칩(null = 첫 단계 자동 선택).
  const [selectedFeedbackStepId, setSelectedFeedbackStepId] = useState<string | null>(null);
  // 오프라인(연결 자체 실패)과 구분되는 온라인 상태의 서버 오류(코덱스 리뷰 1차 P2) —
  // 이 경우 캐시로 조용히 되돌아가지 않고 별도로 표시한다. 세션 만료(401)만 로그인으로
  // 리다이렉트하고, 나머지(404/500 등)는 마지막 화면을 유지한 채 오류만 알린다.
  const [hasError, setHasError] = useState(false);

  // 최초 로드(SSR)로 받은 데이터를 즉시 캐시에 기록 — AD-5 "최초 로드 성공 시 캐시" 요건.
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

  // 코덱스 리뷰 5차 P2(Story 2.3): 요청이 60초보다 오래 걸리면 늦게 도착한 이전 요청의
  // 응답이 최신 상태를 덮어쓸 수 있다 — 요청 순번으로 낡은 응답을 버린다.
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
        // 세션 만료 — 캐시 노출 없이 즉시 로그인 화면으로.
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        // 온라인 상태의 실제 서버 오류 — 마지막 성공 화면을 유지하고 오류만 알린다.
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

  function toggleDone(itemId: string) {
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  // 대표 지시(2026-07-28): 예식 종료를 누르면 피드백 섹션이 바로 나타나야 한다 —
  // 방금 이 화면에서 종료를 누른 경우에만(처음부터 done으로 열린 경우 제외) 렌더된
  // 피드백 섹션으로 스크롤한다. ref 플래그라 setState 없이 소비된다.
  const justEndedRef = useRef(false);
  const feedbackSectionRef = useRef<HTMLDivElement>(null);
  const ceremonyStatusForScroll = asCeremonyStatus(ceremony.status);

  useEffect(() => {
    if (ceremonyStatusForScroll === "done" && justEndedRef.current) {
      justEndedRef.current = false;
      feedbackSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [ceremonyStatusForScroll]);

  function toggleStep(groupKey: string) {
    setCollapsedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  const ceremonyAt = new Date(ceremony.ceremonyAt);
  const ceremonyStatus = asCeremonyStatus(ceremony.status);
  const nextStatus = nextCeremonyStatus(ceremonyStatus);

  // prototype RunScreen.js 38~44행 — 예식 시작(upcoming→ongoing)/예식 종료(ongoing→done).
  // 상태 변경은 온라인 전용(서버가 유일한 진실) — 실패는 즉시 드러낸다(§14 Error).
  async function changeStatus(next: string) {
    setStatusPending(true);
    setStatusError(null);
    // 코덱스 리뷰 P2: 이 POST보다 먼저 시작된 60초 폴링 GET이 나중에 도착하면 낡은
    // 상태로 화면/캐시를 되돌린다 — 진행 중인 폴링 응답을 낡은 것으로 무효화한다.
    latestRequestIdRef.current++;
    try {
      const res = await fetch(`/api/operator/ceremonies/${hallId}/${ceremonyId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setStatusError(body?.error?.message ?? "상태 변경에 실패했습니다 — 다시 시도해주세요.");
        return;
      }
      // 코덱스 리뷰 P2: 동시에 다른 오퍼레이터가 상태를 더 진행시켰을 수 있다 —
      // 요청 값(next)이 아니라 서버가 확정해 돌려준 상태를 반영/캐시한다.
      const body = (await res.json().catch(() => null)) as { status?: string } | null;
      const updated = { ...ceremony, status: body?.status ?? next };
      // POST가 진행되는 동안 새로 시작된 폴링이 있을 수도 있다 — 반영 직전에 한 번 더
      // 무효화해, 이 확정 상태가 어떤 폴링 응답에도 덮이지 않게 한다.
      latestRequestIdRef.current++;
      // 방금 종료를 누른 경우에만 피드백 섹션으로 스크롤(위 useEffect가 소비).
      if (asCeremonyStatus(updated.status) === "done") {
        justEndedRef.current = true;
      }
      setCeremony(updated);
      writeCache(ceremonyId, { ceremony: updated, items });
    } catch {
      setStatusError("연결에 실패했습니다 — 네트워크를 확인하고 다시 시도해주세요.");
    } finally {
      setStatusPending(false);
    }
  }
  const couple =
    ceremony.groomName && ceremony.brideName
      ? `${ceremony.groomName} · ${ceremony.brideName}`
      : null;
  const contractChips = Object.entries(ceremony.contractConditions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => CONTRACT_LABELS[key] ?? key);
  // 대표 지시(2026-07-28): 체크는 진행중(ongoing)에만 가능하다 — 시작 전에는 잠겨
  // 있고, 예식 종료를 누르면 전체 완료로 처리된다. 종료 상태의 완료는 doneIds가 아니라
  // 상태에서 파생시켜 새로고침/다른 기기에서도 동일하게 보인다.
  const checksLocked = ceremonyStatus !== "ongoing";
  const allComplete = ceremonyStatus === "done";
  const isItemDone = (itemId: string) => allComplete || doneIds.has(itemId);
  const doneCount = allComplete
    ? items.length
    : items.filter((item) => doneIds.has(item.id)).length;
  const stepGroups = groupItemsByStep(items);
  // 프로토타입 RunScreen.js 156~189행 — 예식 종료(status done) 후에만 나타나는 피드백
  // 섹션. 피드백은 단계(templateItemId) 단위로 저장되므로 단계 칩으로 대상을 고른다.
  const feedbackSteps = stepGroups
    .map(([, stepItems]) => stepItems[0])
    .filter(
      (first): first is OperatorItem & { templateItemId: string } =>
        Boolean(first.templateItemId && isValidUuid(first.templateItemId)),
    )
    .map((first) => ({ templateItemId: first.templateItemId, stepName: first.stepName }));
  const activeFeedbackStepId =
    feedbackSteps.find((s) => s.templateItemId === selectedFeedbackStepId)?.templateItemId ??
    feedbackSteps[0]?.templateItemId ??
    null;

  return (
    <div className="run-screen">
      {isOffline ? (
        <p className="run-screen__offline-banner" role="status">
          <span className="run-screen__offline-dot" aria-hidden />
          <span>
            <strong>오프라인 상태입니다.</strong> 체크리스트는 저장된 데이터로 계속 볼 수
            있어요. 연결되면 자동으로 최신 상태를 불러옵니다.
          </span>
        </p>
      ) : null}

      {hasError ? (
        <p className="run-screen__error-banner" role="status">
          새로고침에 실패했습니다 — 화면은 그대로 유지됩니다. 잠시 후 다시 확인해주세요.
        </p>
      ) : null}

      {/* 예식 헤더 카드 — RunScreen.js 19~46행 */}
      <div className="run-header-card">
        <div className="run-header-card__info">
          <div className="run-header-card__meta">
            {dateFormatter.format(ceremonyAt)} · {hallName}
          </div>
          <div className="run-header-card__title">
            {timeFormatter.format(ceremonyAt)}
            {couple ? ` ${couple}` : ""} 예식
          </div>
          <div className="run-header-card__chips">
            {contractChips.map((chip) => (
              <span key={chip} className="run-header-card__chip">
                {chip}
              </span>
            ))}
            <span
              className={
                "run-header-card__status-badge run-header-card__status-badge--" + ceremonyStatus
              }
            >
              {CEREMONY_STATUS_LABELS[ceremonyStatus]}
            </span>
          </div>
        </div>
        <div className="run-header-card__side">
          <div className="run-header-card__progress">
            <div className="run-header-card__progress-label">체크 진행</div>
            <div className="run-header-card__progress-count">
              <span className="run-header-card__progress-done">{doneCount}</span>
              <span className="run-header-card__progress-total"> / {items.length}</span>
            </div>
          </div>
          {ceremonyStatus === "upcoming" && (
            <button
              type="button"
              className="run-header-card__status-btn run-header-card__status-btn--start"
              onClick={() => nextStatus && changeStatus(nextStatus)}
              disabled={statusPending}
            >
              {statusPending ? "변경 중..." : "예식 시작"}
            </button>
          )}
          {ceremonyStatus === "ongoing" && (
            <button
              type="button"
              className="run-header-card__status-btn run-header-card__status-btn--end"
              onClick={() => nextStatus && changeStatus(nextStatus)}
              disabled={statusPending}
            >
              {statusPending ? "변경 중..." : "예식 종료"}
            </button>
          )}
        </div>
      </div>
      {statusError && (
        <p className="run-screen__status-error" role="alert">
          {statusError}
        </p>
      )}

      <div className="run-screen__section-title">
        체크리스트{" "}
        <span>
          {ceremonyStatus === "upcoming"
            ? "예식 시작을 누르면 체크할 수 있어요"
            : ceremonyStatus === "done"
              ? "종료된 예식 — 전체 완료 처리됐어요"
              : "단계를 열어 항목별로 체크하세요"}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="run-screen__empty">포함된 항목이 없습니다.</p>
      ) : (
        <div className="run-step-list">
          {stepGroups.map(([groupKey, stepItems], index) => {
            const stepDone = stepItems.filter((item) => isItemDone(item.id)).length;
            const allDone = stepDone === stepItems.length;
            const expanded = !collapsedSteps.has(groupKey);
            return (
              <section
                key={groupKey}
                className={"run-step" + (allDone ? " run-step--done" : "")}
              >
                <button
                  type="button"
                  className="run-step__header"
                  onClick={() => toggleStep(groupKey)}
                  aria-expanded={expanded}
                >
                  <span
                    className={
                      "run-step__index" + (allDone ? " run-step__index--done" : "")
                    }
                  >
                    {index + 1}
                  </span>
                  <span className="run-step__name">{stepItems[0].stepName}</span>
                  {allDone && <span className="run-step__done-badge">완료</span>}
                  <span
                    className={
                      "run-step__count" +
                      (allDone
                        ? " run-step__count--done"
                        : stepDone > 0
                          ? " run-step__count--partial"
                          : "")
                    }
                  >
                    {stepDone} / {stepItems.length}
                  </span>
                  <span className="run-step__chevron" aria-hidden>
                    {expanded ? "▲" : "▼"}
                  </span>
                </button>
                {expanded && (
                  <div className="run-step__body">
                    {stepItems.map((item) => {
                      const itemDone = isItemDone(item.id);
                      const hasDetail = Boolean(item.description || item.videoUrl);
                      const detailOpen = openDetailId === item.id;
                      return (
                        <div key={item.id} className="run-item">
                          <div className="run-item__row">
                            <button
                              type="button"
                              className={
                                "run-item__check" +
                                (itemDone ? " run-item__check--done" : "") +
                                (checksLocked ? " run-item__check--locked" : "")
                              }
                              onClick={() => {
                                if (!checksLocked) toggleDone(item.id);
                              }}
                              disabled={checksLocked}
                              aria-pressed={itemDone}
                              aria-label={`${item.title} 체크`}
                            >
                              {itemDone ? "✓" : ""}
                            </button>
                            <span
                              className={
                                "run-item__title" + (itemDone ? " run-item__title--done" : "")
                              }
                            >
                              {item.title}
                            </span>
                            {hasDetail && (
                              <button
                                type="button"
                                className="run-item__detail-toggle"
                                onClick={() =>
                                  setOpenDetailId(detailOpen ? null : item.id)
                                }
                                aria-expanded={detailOpen}
                              >
                                {detailOpen ? "접기 ▲" : "상세 ▼"}
                              </button>
                            )}
                          </div>
                          {detailOpen && (
                            <div className="run-item__detail">
                              {item.description && (
                                <p className="run-item__description">{item.description}</p>
                              )}
                              {item.videoUrl && (
                                <div className="run-item__video">
                                  <span className="run-item__video-label">▶ 시연 영상</span>
                                  <video controls preload="metadata" src={item.videoUrl} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* 프로토타입 RunScreen.js 156~189행 — 피드백은 예식 종료를 누르면 자동으로
          나타난다(대표 지시 2026-07-28, showFeedback: status === 'done'). 피드백은
          단계(templateItemId) 단위로 저장되므로(Story 3.1 AC 1) 단계 칩으로 대상을
          고르고, 원본 단계가 삭제된 그룹은 칩에서 제외된다. */}
      {ceremonyStatus === "done" && feedbackSteps.length > 0 && (
        <div className="run-feedback" ref={feedbackSectionRef}>
          <div className="run-feedback__title">
            예식 피드백 남기기{" "}
            <span>
              방금 종료된 {timeFormatter.format(ceremonyAt)}
              {couple ? ` ${couple}` : ""} 예식
            </span>
          </div>
          <p className="run-feedback__subtitle">
            기억이 생생할 때 적어주세요. 형식은 시스템이 알아서 정리합니다.
          </p>
          <div className="run-feedback__card">
            <span className="run-feedback__chips-label">단계 선택</span>
            <div className="run-feedback__chips">
              {feedbackSteps.map((step) => (
                <button
                  key={step.templateItemId}
                  type="button"
                  className={
                    "run-feedback__chip" +
                    (step.templateItemId === activeFeedbackStepId
                      ? " run-feedback__chip--selected"
                      : "")
                  }
                  onClick={() => setSelectedFeedbackStepId(step.templateItemId)}
                  aria-pressed={step.templateItemId === activeFeedbackStepId}
                >
                  {step.stepName}
                </button>
              ))}
            </div>
            {activeFeedbackStepId && (
              <StepFeedback
                key={activeFeedbackStepId}
                hallId={hallId}
                ceremonyId={ceremonyId}
                templateItemId={activeFeedbackStepId}
                autoExpand
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
