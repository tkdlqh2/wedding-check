"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// AC 2(UX-DR13, §14 "Loading — 인사이트 클러스터링 갱신 중"):
// 재계산 중에도 **기존 인사이트는 계속 보인다**. 화면을 덮는 스피너/오버레이 대신
// 목록 위에 스켈레톤 줄 하나만 덧붙는다.

const POLL_INTERVAL_MS = 10_000;

export function RecomputeStatus({ isRecomputing }: { isRecomputing: boolean }) {
  const router = useRouter();

  useEffect(() => {
    // 갱신 중일 때만 폴링한다 — 평소에는 타이머가 아예 돌지 않는다.
    if (!isRecomputing) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isRecomputing, router]);

  if (!isRecomputing) return null;

  return (
    <div className="insights-recompute" role="status">
      <div className="insights-recompute__skeleton" aria-hidden="true" />
      <p className="insights-recompute__text">
        인사이트를 갱신하는 중입니다. 아래 목록은 직전 집계 결과입니다.
      </p>
    </div>
  );
}
