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
    // AC 1(AD-6): 발생 홀이 표시용 태그로 붙는다(날짜 · 홀 · 단계).
    expect(screen.getByText("8월 1일 · 그랜드홀 · 주례사 단계")).toBeInTheDocument();
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

  // AC 3(NFR-7, SM-2, UX-DR15): 억지 매칭 대신 "없음"을 명시하는 안전장치 카드.
  it("빈 결과면 #2B82E0 톤 '관련 사례 없음' 정식 카드를 표시한다 (AC 3)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) }),
    );

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    const title = await screen.findByText("관련 사례 없음 — 선임에게 연락하세요");
    expect(title).toBeInTheDocument();
    expect(screen.getByText("관련 사례 없음")).toHaveClass("run-query__none-badge");
    expect(
      screen.getByText(/비슷하지 않은 사례를 억지로 보여드리지 않습니다/),
    ).toBeInTheDocument();
    // 매칭 카드가 하나도 렌더링되지 않아야 한다(무관 사례 0%).
    expect(document.querySelector(".run-query__match")).toBeNull();
    // 안전장치이지 에러가 아니다 — 오류 카드와 섞이지 않는다.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // AC 4(UX-DR14): 실패 종류마다 "무엇이 실패했는지"가 다르게 드러나야 한다.
  it("서버 오류(502)는 서버 봉투 메시지를 담은 오류 카드로 드러낸다 (AC 4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({
          error: { code: "query_failed", message: "질의에 실패했습니다. 다시 시도해주세요" },
        }),
      }),
    );

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("질의에 실패했습니다")).toBeInTheDocument();
    expect(screen.getByText("질의에 실패했습니다. 다시 시도해주세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("봉투가 없는 실패 응답도 기본 재시도 문구로 드러낸다 (AC 4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("질의에 실패했습니다")).toBeInTheDocument();
    expect(screen.getByText("잠시 후 다시 시도해주세요.")).toBeInTheDocument();
  });

  it("검증 실패(400)는 서버가 준 구체적 문구를 보여준다 (AC 4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: "invalid_input", message: "질의는 500자 이내로 입력하세요" },
        }),
      }),
    );

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("질의를 보낼 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("질의는 500자 이내로 입력하세요")).toBeInTheDocument();
  });

  // 세션 만료는 재시도가 아니라 로그인이 필요하다 — 액션 자체가 달라야 한다.
  // 패널이 자동 리다이렉트하지 않는 것도 의도다(예식 중 화면을 강제로 날리지 않음).
  it("세션 만료(401)는 재시도 대신 로그인 링크를 보여준다 (AC 4)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("로그인이 만료되었습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인하러 가기" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("네트워크 예외(fetch throw)는 연결 끊김으로 구분해 드러낸다 (AD-5, AC 4)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("네트워크 연결이 끊겼습니다")).toBeInTheDocument();
    expect(
      screen.getByText("연결이 돌아오면 다시 시도해주세요. 체크리스트는 계속 볼 수 있습니다."),
    ).toBeInTheDocument();
  });

  it("'다시 시도'를 누르면 재질의하고, 성공하면 오류 카드가 사라진다 (AC 4)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [makeMatch()] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));
    await screen.findByText("네트워크 연결이 끊겼습니다");

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("주례자가 예고 없이 순서를 바꿈")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // 오류 카드에는 액션이 달려 있어서, 카드가 가리키는 질의와 입력창 내용이 어긋나면
  // "다시 시도"가 무엇을 재시도하는지 모호해진다 — 입력이 바뀌면 즉시 비운다.
  it("오류 후 입력을 바꾸면 오류 카드가 즉시 사라진다 (AC 4)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<QueryPanel isOffline={false} />);
    const input = screen.getByPlaceholderText("지금 상황을 그대로 적어보세요");
    fireEvent.change(input, { target: { value: "질의 A" } });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));
    await screen.findByText("네트워크 연결이 끊겼습니다");

    fireEvent.change(input, { target: { value: "질의 B" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // 의도된 비대칭: 매칭 카드는 액션이 없어 모호함이 없고, 예식 중 후속 질문을
  // 타이핑하면서 방금 받은 근거를 계속 읽을 수 있어야 한다(3.3 확정 동작 유지).
  it("매칭 카드는 입력을 바꿔도 남아 있다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [makeMatch()] }) }),
    );

    render(<QueryPanel isOffline={false} />);
    const input = screen.getByPlaceholderText("지금 상황을 그대로 적어보세요");
    fireEvent.change(input, { target: { value: "질의 A" } });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));
    await screen.findByText("주례자가 예고 없이 순서를 바꿈");

    fireEvent.change(input, { target: { value: "질의 B" } });

    expect(screen.getByText("주례자가 예고 없이 순서를 바꿈")).toBeInTheDocument();
  });

  // 코덱스 리뷰 P2: 2xx인데 본문이 깨졌으면 렌더링 중 크래시해 오류 카드조차 뜨지
  // 않는다 — 예식 중 화면이 죽는 것이 최악이다. 배열 원소 하나하나까지 검증한다.
  it.each([
    ["JSON이 아님", () => { throw new Error("not json"); }],
    ["matches 키 없음", () => ({})],
    ["matches가 배열이 아님", () => ({ matches: "nope" })],
    ["원소가 null", () => ({ matches: [null] })],
    ["원소에 필수 필드 누락", () => ({ matches: [{ id: "x", situation: "s" }] })],
    ["similarity가 숫자가 아님", () => ({ matches: [makeMatch({ similarity: "높음" })] })],
  ])("2xx인데 본문 셰이프가 깨지면 오류 카드로 드러낸다 — %s", async (_label, json) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => json() }));

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("응답을 읽지 못했습니다. 다시 시도해주세요.")).toBeInTheDocument();
    // 연결은 멀쩡하므로 네트워크 문구로 잘못 안내하지 않는다.
    expect(screen.queryByText("네트워크 연결이 끊겼습니다")).not.toBeInTheDocument();
  });

  // 예식 중 화면에 "Invalid Date"가 노출되면 안 된다 — 날짜 조각만 생략한다.
  it("createdAt이 잘못된 값이면 날짜 없이 홀·단계만 표시한다 (AC 1)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [makeMatch({ createdAt: "not-a-date" })] }),
      }),
    );

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("그랜드홀 · 주례사 단계")).toBeInTheDocument();
    expect(screen.queryByText(/Invalid/)).not.toBeInTheDocument();
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

  // 사용자 지침(2026-07-28) + 코덱스 리뷰 2~3차 P2: 요청이 in-flight인 동안 입력창도
  // 함께 잠근다 — 대기 중 입력이 바뀌어 도착한 응답(성공/실패)이 제출한 적 없는 새
  // 입력의 결과처럼 보이는 계열 결함을 단순 차단으로 원천 제거. 완료되면 다시 풀린다.
  it("질의 대기 중에는 입력창도 비활성화되고, 완료되면 다시 풀린다", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    const input = screen.getByPlaceholderText("지금 상황을 그대로 적어보세요");
    fireEvent.change(input, { target: { value: "질의 A" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "질의하기" }));
    });

    expect(input).toBeDisabled();

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ matches: [makeMatch()] }) });
    });
    expect(input).not.toBeDisabled();
    expect(screen.getByText("주례자가 예고 없이 순서를 바꿈")).toBeInTheDocument();
  });

  it("질의 실패 후에도 입력창 잠금이 풀린다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<QueryPanel isOffline={false} />);
    const input = screen.getByPlaceholderText("지금 상황을 그대로 적어보세요");
    fireEvent.change(input, { target: { value: "질의 A" } });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    await screen.findByText("네트워크 연결이 끊겼습니다");
    expect(input).not.toBeDisabled();
  });

  it("오류 후 '질의하기'로 재질의해도 오류 카드가 사라지고 결과가 표시된다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => null })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [makeMatch()] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    fireEvent.change(screen.getByPlaceholderText("지금 상황을 그대로 적어보세요"), {
      target: { value: "질의" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));
    await screen.findByText("질의에 실패했습니다");

    fireEvent.click(screen.getByRole("button", { name: "질의하기" }));

    expect(await screen.findByText("주례자가 예고 없이 순서를 바꿈")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
