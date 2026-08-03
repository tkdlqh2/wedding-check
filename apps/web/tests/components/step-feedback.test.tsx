import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

  // 대표 지시(2026-08-03): 저장 버튼 제거. 임시저장 자체는 FR-8 요구사항이므로
  // 포커스 아웃 시 조용히 저장하는 방식으로 남긴다.
  it("저장 버튼은 없다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ feedback: null }) }),
    );

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");

    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });

  it("입력에서 포커스가 빠지면 조용히 임시저장한다 (AC 1)", async () => {
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
    fireEvent.blur(textarea);

    expect(await screen.findByText("임시저장됨")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/feedback/${props.hallId}/${props.ceremonyId}`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateItemId: props.templateItemId, content: "새로 쓴 내용" }),
      }),
    );
  });

  it("내용이 바뀌지 않았으면 포커스가 빠져도 저장하지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feedback: { content: "기존 내용", status: "draft" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByDisplayValue("기존 내용");

    fireEvent.blur(textarea);

    // GET 한 번뿐 — 펼쳐서 읽기만 하고 지나가는 게 흔한 경로다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("임시저장됨")).not.toBeInTheDocument();
  });

  it("비어 있는 입력에서는 포커스가 빠져도 오류를 띄우지 않는다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ feedback: null }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");

    fireEvent.blur(textarea);

    expect(fetchMock).toHaveBeenCalledTimes(1); // GET만
    expect(screen.queryByText(/저장하지 못했습니다/)).not.toBeInTheDocument();
  });

  // 사용자 지침(2026-08-03) — 응답 버전 추적 대신 **요청 중 입력 잠금**으로 계열
  // 전체를 없앤다(3.3 질의창과 같은 방식). 이게 막는 것: (a) 저장 응답이 그 사이
  // 이어 쓴 글을 덮어쓰는 유실, (b) 저장 중 글을 고치고 구조화를 눌러 예전 글이
  // 구조화되는 어긋남. 둘 다 "요청 중에는 못 쓴다"는 전제 하나로 사라진다.
  it("저장 요청이 도는 동안에는 입력창이 잠긴다", async () => {
    let resolveSave: (value: unknown) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) }) // GET
      .mockReturnValueOnce(new Promise((resolve) => (resolveSave = resolve))); // POST 저장(지연)
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = (await screen.findByPlaceholderText(
      "있었던 일을 그대로 적으세요",
    )) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "쓴 글" } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(textarea).toBeDisabled());

    resolveSave({
      ok: true,
      json: async () => ({ feedback: { content: "쓴 글", status: "draft", tags: [] } }),
    });

    // 끝나면 다시 쓸 수 있다.
    await waitFor(() => expect(textarea).toBeEnabled());
    expect(textarea.value).toBe("쓴 글");
  });

  it("구조화가 도는 동안에도 입력창이 잠긴다", async () => {
    let resolveStructure: (value: unknown) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) }) // GET
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ feedback: { content: "쓴 글", status: "draft", tags: [] } }),
      }) // POST 저장
      .mockReturnValueOnce(new Promise((resolve) => (resolveStructure = resolve))); // /structure(지연)
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = (await screen.findByPlaceholderText(
      "있었던 일을 그대로 적으세요",
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "쓴 글" } });
    fireEvent.click(screen.getByRole("button", { name: "구조화하기" }));

    await waitFor(() => expect(textarea).toBeDisabled());

    resolveStructure({
      ok: true,
      json: async () => ({
        feedback: {
          content: "쓴 글",
          status: "draft",
          situation: "상황",
          outcome: "well_handled",
          rationale: "판단",
          tags: ["태그"],
        },
      }),
    });

    await waitFor(() => expect(textarea).toBeEnabled());
  });

  it("저장 응답의 원문을 그대로 반영한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // 서버가 trim한 값을 돌려주는 경우 — 화면도 그 값으로 맞춰야 한다.
          feedback: { content: "쓴 글", status: "draft", tags: [] },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = (await screen.findByPlaceholderText(
      "있었던 일을 그대로 적으세요",
    )) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "  쓴 글  " } });
    fireEvent.blur(textarea);

    await screen.findByText("임시저장됨");
    expect(textarea.value).toBe("쓴 글");
  });

  it("자동 저장이 실패하면 즉시 오류 문구를 표시한다(조용한 실패 금지)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");
    fireEvent.change(textarea, { target: { value: "내용" } });
    fireEvent.blur(textarea);

    expect(await screen.findByText(/저장하지 못했습니다/)).toBeInTheDocument();
  });
});

// Story 3.2(FR-9, AD-8): 구조화하기 -> 필드 확인/수정 -> 확정.
describe("StepFeedback — 구조화/확정 (Story 3.2 AC 1, 2, 3, 4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // 대표 지적(2026-08-03) 회귀 테스트. 이전에는 구조화 섹션 전체가
  // status === "draft" 게이트 안에 있어서, **저장 이력이 없는 단계에서는 버튼이
  // 아예 렌더되지 않았다** — 저장을 먼저 눌러야 한다는 안내도 없어서 "특정 단계만
  // 구조화가 된다"처럼 보였다. 저장 여부와 무관하게 보여야 한다.
  it("저장한 적 없는 단계에서도 '구조화하기' 버튼이 보인다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ feedback: null }) }),
    );

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");

    // 내용이 없으면 구조화할 것도 없으므로 비활성 — 하지만 **존재는 한다**.
    expect(screen.getByRole("button", { name: "구조화하기" })).toBeDisabled();
    fireEvent.change(textarea, { target: { value: "내용" } });
    expect(screen.getByRole("button", { name: "구조화하기" })).not.toBeDisabled();
  });

  it("'구조화하기'가 저장을 먼저 하고 구조화한다 — 저장 없이도 한 번에 (AC 1)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) }) // GET (펼침)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ feedback: { content: "내용", status: "draft" } }),
      }) // POST 저장(구조화 버튼이 스스로 수행)
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

    // "저장"을 거치지 않고 바로 구조화한다.
    fireEvent.click(screen.getByRole("button", { name: "구조화하기" }));

    expect(await screen.findByDisplayValue("구조화된 상황 설명")).toBeInTheDocument();
    expect(screen.getByDisplayValue("구조화된 사후 판단")).toBeInTheDocument();
    expect(screen.getByDisplayValue("태그1, 태그2")).toBeInTheDocument();

    // 저장(POST) → 구조화(POST /structure) 순서로 정확히 두 번.
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/feedback/${props.hallId}/${props.ceremonyId}`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateItemId: props.templateItemId, content: "내용" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/feedback/${props.hallId}/${props.ceremonyId}/structure`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateItemId: props.templateItemId }),
      }),
    );
  });

  // 구조화 입력은 **DB에 저장된 content**다. 저장 뒤 글을 고치고 구조화하면
  // 예전 글이 구조화되던 함정을 선행 저장이 함께 없앤다.
  it("저장 후 글을 고쳐도 화면에 보이는 내용이 구조화된다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ feedback: { content: "예전 글", status: "draft" } }),
      }) // GET (펼침 — 이미 저장된 draft)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ feedback: { content: "고친 글", status: "draft" } }),
      }) // POST 저장
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            content: "고친 글",
            status: "draft",
            situation: "상황",
            outcome: "well_handled",
            rationale: "판단",
            tags: ["태그"],
          },
        }),
      }); // POST /structure
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByDisplayValue("예전 글");
    fireEvent.change(textarea, { target: { value: "고친 글" } });
    fireEvent.click(screen.getByRole("button", { name: "구조화하기" }));

    await screen.findByDisplayValue("상황");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/feedback/${props.hallId}/${props.ceremonyId}`,
      expect.objectContaining({
        body: JSON.stringify({ templateItemId: props.templateItemId, content: "고친 글" }),
      }),
    );
  });

  // 브라우저는 click 전에 blur를 먼저 보낸다 — 글을 쓰고 바로 구조화하기를 누르면
  // 자동 저장과 구조화의 선행 저장이 같은 순간에 겹친다. 각자 요청을 보내면 늦게
  // 도착한 저장 응답이 먼저 도착한 구조화 결과를 덮어써 구조화 전으로 되돌아간다.
  it("자동 저장과 구조화가 겹쳐도 저장 요청은 한 번만 나간다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) }) // GET
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ feedback: { content: "내용", status: "draft" } }),
      }) // POST 저장 (한 번만)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            content: "내용",
            status: "draft",
            situation: "구조화된 상황",
            outcome: "well_handled",
            rationale: "판단",
            tags: ["태그"],
          },
        }),
      }); // POST /structure
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");
    fireEvent.change(textarea, { target: { value: "내용" } });

    // 실제 순서 그대로: blur → click
    fireEvent.blur(textarea);
    fireEvent.click(screen.getByRole("button", { name: "구조화하기" }));

    // 구조화 결과가 남아 있어야 한다 — 늦게 온 저장 응답에 덮어써지지 않는다.
    expect(await screen.findByDisplayValue("구조화된 상황")).toBeInTheDocument();
    // GET + 저장 1 + 구조화 1 = 3. 저장이 두 번 나갔다면 4가 된다.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("선행 저장이 실패하면 구조화를 시도하지 않고 오류를 알린다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ feedback: null }) }) // GET
      .mockResolvedValueOnce({ ok: false, status: 500 }); // POST 저장 실패
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const textarea = await screen.findByPlaceholderText("있었던 일을 그대로 적으세요");
    fireEvent.change(textarea, { target: { value: "내용" } });
    fireEvent.click(screen.getByRole("button", { name: "구조화하기" }));

    expect(await screen.findByText(/구조화하지 못했습니다/)).toBeInTheDocument();
    // GET + 저장 시도까지 2번뿐 — /structure는 호출되지 않았다.
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  // 코덱스 리뷰 2라운드: disabled={confirmState==="confirming"}만으로는 클릭과 리렌더
  // 사이의 짧은 창에서 더블클릭이 fetch를 두 번 보낼 수 있다 — ref 기반 가드가
  // 실제로 두 번째 호출을 막는지 확인한다.
  it("확정 버튼을 연속으로 두 번 눌러도 확정 요청은 한 번만 보낸다", async () => {
    let resolveConfirm!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const confirmPromise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveConfirm = resolve;
    });
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
      .mockReturnValueOnce(confirmPromise);
    vi.stubGlobal("fetch", fetchMock);

    render(<StepFeedback {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "피드백 남기기" }));
    const confirmBtn = await screen.findByRole("button", { name: "확정" });

    // 코덱스 리뷰 3라운드: 두 fireEvent.click을 각각 따로 호출하면 RTL이 클릭마다
    // act()로 감싸 그 사이에 리렌더가 끝나버려, disabled 속성이 이미 갱신된 뒤에
    // 두 번째 클릭이 발생한다 — 이러면 ref 가드가 아니라 "비활성화된 버튼은
    // 클릭 이벤트를 못 받는다"는 jsdom의 기본 동작만으로도 테스트가 통과해,
    // ref 가드 자체를 검증하지 못하는 위양성 테스트가 된다. 하나의 act() 안에
    // 두 클릭을 함께 넣어 그 사이에 리렌더/커밋이 끼어들지 못하게 하면(React가
    // act 콜백이 끝날 때까지 커밋을 미룸) 두 클릭 모두 "아직 비활성화되지 않은"
    // 버튼에 도달한 상태로 handleConfirm이 호출돼, 실제로 confirmingRef가
    // 두 번째 호출을 막는지를 검증한다.
    act(() => {
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);
    });

    resolveConfirm({
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
    });
    await screen.findByText("확정됨");

    const confirmCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith("/confirm"));
    expect(confirmCalls).toHaveLength(1);
  });
});
