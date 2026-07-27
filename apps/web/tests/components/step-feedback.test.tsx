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

// Story 3.2(FR-9, AD-8): 구조화하기 -> 필드 확인/수정 -> 확정.
describe("StepFeedback — 구조화/확정 (Story 3.2 AC 1, 2, 3, 4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draft 저장 후에만 '구조화하기' 버튼이 나타나고, 성공하면 4개 필드가 채워진다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) }) // GET (펼침)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ feedback: { content: "내용", status: "draft" } }),
      }) // POST 저장
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            content: "내용",
            status: "draft",
            situation: "구조화된 상황 설명",
            outcome: "well_handled",
            rationale: "구조화된 사후 판단",
            tags: ["태그1", "태그2"],
          },
        }),
      }); // POST /structure
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");
    fireEvent.change(textarea, { target: { value: "내용" } });

    expect(screen.queryByRole("button", { name: "구조화하기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("button", { name: "구조화하기" });

    fireEvent.click(screen.getByRole("button", { name: "구조화하기" }));

    expect(await screen.findByDisplayValue("구조화된 상황 설명")).toBeInTheDocument();
    expect(screen.getByDisplayValue("구조화된 사후 판단")).toBeInTheDocument();
    expect(screen.getByDisplayValue("태그1, 태그2")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/feedback/${props.hallId}/${props.ceremonyId}/structure`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateItemId: props.templateItemId }),
      }),
    );
  });

  it("필드를 수정하면 확정 버튼이 비활성화되고, '필드 저장' 후 다시 활성화된다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            content: "내용",
            status: "draft",
            situation: "상황",
            outcome: "well_handled",
            rationale: "판단",
            tags: ["태그"],
          },
        }),
      }) // GET (펼침 — 이미 구조화된 draft)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            content: "내용",
            status: "draft",
            situation: "수정된 상황",
            outcome: "well_handled",
            rationale: "판단",
            tags: ["태그"],
          },
        }),
      }); // PATCH
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const situationInput = await screen.findByDisplayValue("상황");

    const confirmBtn = screen.getByRole("button", { name: "확정" });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.change(situationInput, { target: { value: "수정된 상황" } });
    expect(confirmBtn).toBeDisabled();
    // 코덱스 리뷰: 저장 안 된 수정 중에 재구조화를 누르면 그 수정이 조용히
    // 덮어써진다 — 필드 저장 전까지는 "구조화하기"도 비활성화돼야 한다.
    expect(screen.getByRole("button", { name: "구조화하기" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "필드 저장" }));
    await screen.findByText("임시저장됨");
    expect(confirmBtn).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "구조화하기" })).not.toBeDisabled();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/feedback/${props.hallId}/${props.ceremonyId}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          templateItemId: props.templateItemId,
          situation: "수정된 상황",
          outcome: "well_handled",
          rationale: "판단",
          tags: ["태그"],
        }),
      }),
    );
  });

  it("확정에 성공하면 초록 '확정됨' 배지가 나타나고 필드가 읽기 전용으로 바뀐다(축하 연출 없음)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            content: "내용",
            status: "draft",
            situation: "상황",
            outcome: "well_handled",
            rationale: "판단",
            tags: ["태그"],
          },
        }),
      }) // GET
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            content: "내용",
            status: "confirmed",
            situation: "상황",
            outcome: "well_handled",
            rationale: "판단",
            tags: ["태그"],
          },
        }),
      }); // POST /confirm
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    await screen.findByRole("button", { name: "확정" });

    fireEvent.click(screen.getByRole("button", { name: "확정" }));

    expect(await screen.findByText("확정됨")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("상황")).not.toBeInTheDocument();
    expect(screen.getByText("잘 대처됨")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/feedback/${props.hallId}/${props.ceremonyId}/confirm`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateItemId: props.templateItemId }),
      }),
    );
  });

  it("확정 실패 시 즉시 오류 문구를 표시한다(조용한 실패 금지)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            content: "내용",
            status: "draft",
            situation: "상황",
            outcome: "well_handled",
            rationale: "판단",
            tags: ["태그"],
          },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 502 });
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    await screen.findByRole("button", { name: "확정" });
    fireEvent.click(screen.getByRole("button", { name: "확정" }));

    expect(await screen.findByText(/확정하지 못했습니다/)).toBeInTheDocument();
  });
});
