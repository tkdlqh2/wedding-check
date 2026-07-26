"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  ALLOWED_VIDEO_CONTENT_TYPE,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/storage/video-storage";

export function VideoUpload({
  hallId,
  templateItemId,
  blobEnabled,
}: {
  hallId: string;
  templateItemId: string;
  blobEnabled: boolean;
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
        // onUploadCompleted 웹훅은 이 응답과 별도로 도착한다 — 즉시 반영되지 않을 수
        // 있음(v1 알려진 한계, Dev Notes 참고).
        setNotice("업로드 완료, 목록에 반영 중...");
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
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
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
