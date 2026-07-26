import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VideoUpload } from "@/app/admin/templates/[hallId]/video-upload";

// 폴링 루프 자체의 상세 동작(타임아웃, 네트워크 실패 등)은
// tests/lib/video-upload-polling.test.ts에서 순수 함수 단위로 검증한다.
// 여기서는 실제 폼 제출 → React 상태 업데이트 → 화면 반영까지 배선이
// 맞는지 확인하는 스모크 테스트만 둔다.

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const uploadMock = vi.fn();
vi.mock("@vercel/blob/client", () => ({
  upload: (...args: unknown[]) => uploadMock(...args),
}));

function makeMp4File() {
  return new File(["x"], "demo.mp4", { type: "video/mp4" });
}

describe("VideoUpload — blob 업로드 폼 배선", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    uploadMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("업로드 후 상태 확인 API가 반영을 확인하면 새로고침하고 안내 문구를 지운다", async () => {
    uploadMock.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ videoUrl: "/api/local-videos/new.mp4" }),
      }),
    );

    render(
      <VideoUpload
        hallId="hall-1"
        templateItemId="item-1"
        blobEnabled={true}
        currentVideoUrl={undefined}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeMp4File()] } });
    fireEvent.submit(screen.getByRole("button", { name: /업로드/ }).closest("form")!);

    expect(await screen.findByText("업로드 완료, 목록에 반영 중...")).toBeInTheDocument();
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(screen.queryByText("업로드 완료, 목록에 반영 중...")).not.toBeInTheDocument();
  });
});
