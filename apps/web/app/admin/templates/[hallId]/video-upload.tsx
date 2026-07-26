"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  ALLOWED_VIDEO_CONTENT_TYPE,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/storage/video-storage";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STATUS_POLL_INTERVAL_MS = 1000;
const STATUS_POLL_MAX_ATTEMPTS = 15; // 약 15초까지 대기

// blob 경로에서 onUploadCompleted 웹훅이 DB에 실제로 반영됐는지 확인한다(코덱스
// 리뷰 3차 P2 — 고정 시간만큼 새로고침하고 끝내면 웹훅이 늦게 도착할 때 조용히
// 낡은 상태로 남는다). 반영을 확인한 시점에만 새로고침하고, 시간 내 확인되지
// 않으면 성공을 가장하지 않고 솔직하게 안내한다(DESIGN.md §4 "관련 사례 없음"과
// 같은 원칙 — 확인 안 된 것을 확인된 것처럼 보여주지 않는다).
export async function waitForVideoUpdate(
  hallId: string,
  templateItemId: string,
  previousVideoUrl: string | undefined,
): Promise<boolean> {
  for (let attempt = 0; attempt < STATUS_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(STATUS_POLL_INTERVAL_MS);
    try {
      const res = await fetch(
        `/api/templates/${hallId}/items/${templateItemId}/video/status`,
      );
      if (res.ok) {
        const body = (await res.json()) as { videoUrl: string | null };
        if (body.videoUrl && body.videoUrl !== previousVideoUrl) {
          return true;
        }
      }
    } catch {
      // 폴링 자체의 네트워크 실패는 무시하고 다음 시도로 넘어간다.
    }
  }
  return false;
}

export function VideoUpload({
  hallId,
  templateItemId,
  blobEnabled,
  currentVideoUrl,
}: {
  hallId: string;
  templateItemId: string;
  blobEnabled: boolean;
  currentVideoUrl?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("업로드할 파일을 선택해주세요");
      return;
    }

    // 즉각 피드백용 클라이언트 사전 검증 — 서버 검증(각 라우트)의 대체가 아니다.
    if (file.type !== ALLOWED_VIDEO_CONTENT_TYPE) {
      setError("mp4 형식의 영상만 업로드할 수 있어요");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setError("500MB 이하의 파일만 업로드할 수 있어요");
      return;
    }

    setUploading(true);
    try {
      if (blobEnabled) {
        await upload(file.name, file, {
          access: "public",
          handleUploadUrl: `/api/templates/${hallId}/items/${templateItemId}/video/blob`,
          clientPayload: JSON.stringify({ fileSize: file.size }),
        });
        if (inputRef.current) inputRef.current.value = "";
        // onUploadCompleted 웹훅은 이 응답과 별도(비동기)로 도착해 DB 행을 만든다 —
        // 실제로 반영될 때까지 상태 확인 API를 폴링한다(로컬은 웹훅 자체가 오지
        // 않아 항상 타임아웃함, Dev Notes 참고 — 이 경우 안내 문구로 솔직하게 알림).
        setNotice("업로드 완료, 목록에 반영 중...");
        const confirmed = await waitForVideoUpdate(hallId, templateItemId, currentVideoUrl);
        if (confirmed) {
          router.refresh();
          setNotice(null);
        } else {
          setNotice("업로드는 완료됐지만 아직 목록에 반영되지 않았어요 — 잠시 후 새로고침해주세요");
        }
      } else {
        const formData = new FormData();
        formData.set("file", file);
        const res = await fetch(
          `/api/templates/${hallId}/items/${templateItemId}/video/local`,
          { method: "POST", body: formData },
        );
        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? "업로드에 실패했습니다");
        }
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="video-upload" onSubmit={handleSubmit}>
      <input ref={inputRef} type="file" accept="video/mp4" disabled={uploading} />
      <button type="submit" className="btn-secondary" disabled={uploading}>
        {uploading ? "업로드 중..." : "업로드"}
      </button>
      {error && <p className="field-error">{error}</p>}
      {notice && !error && <p className="video-upload__notice">{notice}</p>}
    </form>
  );
}
