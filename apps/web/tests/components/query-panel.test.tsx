import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryPanel } from "@/app/operator/ceremonies/[hallId]/[ceremonyId]/query-panel";

function makeMatch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    stepName: "주례사",
    situation: "주례자가 예고 없이 순서를 바꿈",
    outcome: "well_handled",
    rationale: "사회자와 눈을 맞추고 다음 큐를 미뤘음",
    tags: ["주례"],
    hallName: "그랜드홀",
    similarity: 0.93,
    createdAt: "2026-08-01T05:00:00.000Z",
    ...overrides,
  };
}

describe("QueryPanel (AC 1, 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("제목·헬퍼·입력·질의하기 버튼을 프로토타입 문구 그대로 렌더링한다", () => {
    render(<QueryPanel isOffline={false} />);

    expect(screen.getByText("지금 이런 상황인데 어떡하죠?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질의하기" })).toBeInTheDocument();
  });

  it("입력이 비어있으면 버튼이 비활성화된다", () => {
    render(<QueryPanel isOffline={false} />);
    expect(screen.getByRole("button", { name: "질의하기" })).toBeDisabled();
  });

  it("질의하면 POST /api/query를 호출하고 매칭 카드를 렌더링한다 (AC 1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [makeMatch()] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "주례자가 순서를 바꿨어요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("주례자가 예고 없이 순서를 바꿈")).toBeInTheDocument();
    expect(screen.getByText("유사도 1위 · 93%")).toBeInTheDocument();
    expect(screen.getByText("잘 대처됨")).toBeInTheDocument();
    expect(screen.getByText("사후 판단 — 이렇게 하세요")).toBeInTheDocument();
    expect(screen.getByText("사회자와 눈을 맞추고 다음 큐를 미뤘음")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "주례자가 순서를 바꿨어요" }),
      }),
    );
  });

  it("잘못 대처된 케이스는 빨간 결과 배지로 표시된다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [makeMatch({ outcome: "mishandled" })] }),
      }),
    );

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    const badge = await screen.findByText("잘못 대처됨");
    expect(badge.className).toContain("run-query__match-outcome--mis");
  });

  // AC 3(UX-DR13/18): 대기 중 버튼은 너비 유지 + disabled + 스피너. React 리렌더
  // 전의 더블클릭까지 막는지 확인하기 위해 두 클릭을 하나의 act로 묶는다
  // (Story 3.2 코덱스 리뷰 3라운드 교훈 — 따로 감싸면 disabled만으로 통과하는
  // 위양성 테스트가 된다).
  it("질의 대기 중 재클릭해도 fetch는 한 번만 호출된다 (AC 3)", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });

    const button = screen.getByRole("button", { name: "질의하기" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 스피너 + disabled + 로딩 상태에서도 너비를 유지하는 클래스 구성 확인.
    const pendingButton = screen.getByRole("status", { name: "질의 중" }).closest("button");
    expect(pendingButton).toBeDisabled();
    expect(pendingButton?.className).toContain("run-query__submit--loading");

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ matches: [] }) });
    });
  });

  it("질의 대기 중 Enter 키 재제출도 무시된다 (AC 3)", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    const input = screen.getByPlaceholderText("지금 상황을 그대로 적어보세요");
    fireEvent.change(input, { target: { value: "질의" } });

    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ matches: [] }) });
    });
  });

  it("빈 결과면 '관련 사례 없음 — 선임에게 연락하세요'를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) }),
    );

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("관련 사례 없음 — 선임에게 연락하세요")).toBeInTheDocument();
  });

  it("서버 오류(502 등)면 즉시 오류 문구를 드러낸다 (조용한 실패 금지)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(
      await screen.findByText("질의에 실패했습니다 — 다시 시도해주세요."),
    ).toBeInTheDocument();
  });

  it("네트워크 예외(fetch throw)도 동일한 오류 문구를 드러낸다 (AD-5)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(
      await screen.findByText("질의에 실패했습니다 — 다시 시도해주세요."),
    ).toBeInTheDocument();
  });

  it("오프라인이면 버튼이 비활성화되고 클릭해도 요청하지 않는다 (AD-5)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={true} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });

    const button = screen.getByRole("button", { name: "질의하기" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  // 코덱스 리뷰 P2: 새 질의를 기다리는 동안 이전 질의의 매칭 카드가 남아 있으면
  // 다른 상황에 대한 낡은 판단이 새 질문의 근거처럼 보인다 — 질의 시작 시점에
  // 즉시 비워져야 한다.
  it("새 질의 대기 중에는 이전 질의의 매칭 카드가 보이지 않는다", async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [makeMatch()] }) })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    const input = screen.getByPlaceholderText("지금 상황을 그대로 적어보세요");
    fireEvent.change(input, { target: { value: "첫 번째 상황" } });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));
    await screen.findByText("주례자가 예고 없이 순서를 바꿈");

    fireEvent.change(input, { target: { value: "전혀 다른 두 번째 상황" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "질의하기" }));
    });

    expect(screen.queryByText("주례자가 예고 없이 순서를 바꿈")).not.toBeInTheDocument();

    await act(async () => {
      resolveSecond({ ok: true, json: async () => ({ matches: [] }) });
    });
    expect(await screen.findByText("관련 사례 없음 — 선임에게 연락하세요")).toBeInTheDocument();
  });

  it("오류 후 재질의에 성공하면 오류 문구가 사라지고 결과가 표시된다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [makeMatch()] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));
    await screen.findByText("질의에 실패했습니다 — 다시 시도해주세요.");

    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("주례자가 예고 없이 순서를 바꿈")).toBeInTheDocument();
    expect(
      screen.queryByText("질의에 실패했습니다 — 다시 시도해주세요."),
    ).not.toBeInTheDocument();
  });
});
