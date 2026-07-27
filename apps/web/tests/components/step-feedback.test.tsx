import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StepFeedback } from "@/app/operator/ceremonies/[hallId]/[ceremonyId]/step-feedback";

const props = {
  hallId: "11111111-1111-1111-1111-111111111111",
  ceremonyId: "22222222-2222-2222-2222-222222222222",
  templateItemId: "33333333-3333-3333-3333-333333333333",
};

describe("StepFeedback (AC 1, 2, 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("기본 상태는 접힌 '피드백 남기기' 버튼만 보인다", () => {
    render(<StepFeedback {...props} />);

    expect(screen.getByRole("button", { name: "피드백 남기기" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("있었던 일을 그대로 적으세요")).not.toBeInTheDocument();
  });

  it("펼치면 기존 draft를 가져와 textarea에 프리필한다 (AC 2)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ feedback: { content: "이전에 쓴 내용" } }),
      }),
    );

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));

    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");
    await waitFor(() => expect(textarea).toHaveValue("이전에 쓴 내용"));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/api/feedback/${props.hallId}/${props.ceremonyId}?templateItemId=${props.templateItemId}`,
      ),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("draft가 없으면 textarea가 빈 채로 폼처럼 보이지 않는 placeholder만 표시된다 (AC 3)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ feedback: null }) }),
    );

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));

    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");
    expect(textarea).toHaveValue("");
  });

  it("저장하면 POST를 호출하고 초록이 아닌 임시저장 확인 문구를 보여준다 (AC 1)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ feedback: { content: "새로 쓴 내용" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");

    fireEvent.change(textarea, { target: { value: "새로 쓴 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("임시저장됨")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/feedback/${props.hallId}/${props.ceremonyId}`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateItemId: props.templateItemId, content: "새로 쓴 내용" }),
      }),
    );
  });

  it("저장 실패 시 즉시 오류 문구를 표시한다(조용한 실패 금지)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");
    fireEvent.change(textarea, { target: { value: "내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText(/저장하지 못했습니다/)).toBeInTheDocument();
  });

  it("내용이 비어 있으면 저장 버튼이 비활성화된다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ feedback: null }) }),
    );

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");

    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });
});
