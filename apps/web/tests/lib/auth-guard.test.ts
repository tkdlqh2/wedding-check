import { describe, it, expect, vi, beforeEach } from "vitest";

// Story 4.2(FR-11, AD-3) — 관리자 전용 화면의 인가 가드.
// DB나 실제 better-auth 없이 "어떤 세션이면 어디로 보내는가"만 고정한다.

const { getSessionMock, redirectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    // 실제 next/navigation의 redirect()는 **throw로 실행을 끊는다**. 여기서 그냥
    // 반환하게 두면 가드가 리다이렉트 후에도 계속 실행되는 결함을 테스트가 놓친다.
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${url}`;
    throw err;
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionMock(...args) } },
}));

const { requireAdminPage, requireAdminSession, requireSession, requireSessionOr401 } =
  await import("@/lib/auth-guard");

function sessionOf(role: string) {
  return { user: { id: "user-1", role } };
}

beforeEach(() => {
  getSessionMock.mockReset();
  redirectMock.mockClear();
});

describe("requireAdminPage — 관리자 전용 페이지 가드 (AC 1, 2)", () => {
  it("관리자 세션이면 통과하고 세션을 돌려준다 (AC 1)", async () => {
    getSessionMock.mockResolvedValue(sessionOf("admin"));

    await expect(requireAdminPage()).resolves.toEqual(sessionOf("admin"));
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("오퍼레이터 세션이면 차단하고 자기 홈으로 보낸다 (AC 2)", async () => {
    getSessionMock.mockResolvedValue(sessionOf("operator"));

    // 로그인은 이미 돼 있으므로 /login이 아니다 — 로그인 폼을 다시 띄우는 건 사실과
    // 다르고, 그가 할 수 있는 일(자기 화면으로 돌아가기)을 가리킨다(D-4, §10).
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/operator");
    expect(redirectMock).toHaveBeenCalledWith("/operator");
  });

  it("세션이 없으면 로그인 화면으로 보낸다", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("알 수 없는 역할도 admin이 아니면 차단한다(화이트리스트 판정)", async () => {
    // AD-3상 역할은 2종뿐이지만, 판정은 "admin인가?"여야지 "operator인가?"가 되면
    // 미래에 역할이 늘었을 때 조용히 열린다.
    getSessionMock.mockResolvedValue(sessionOf("owner"));

    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/operator");
  });

  it("요청마다 세션을 다시 조회한다 — 캐시가 가드를 약화시키지 않는다", async () => {
    // React.cache는 요청 스코프라 강등된 뒤의 다음 요청은 새 역할을 본다(D-5).
    getSessionMock.mockResolvedValueOnce(sessionOf("admin"));
    await expect(requireAdminPage()).resolves.toBeTruthy();

    getSessionMock.mockResolvedValueOnce(sessionOf("operator"));
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/operator");

    expect(getSessionMock).toHaveBeenCalledTimes(2);
  });
});

describe("requireAdminSession — Server Action 가드", () => {
  it("관리자 세션이면 통과한다", async () => {
    getSessionMock.mockResolvedValue(sessionOf("admin"));
    await expect(requireAdminSession()).resolves.toEqual(sessionOf("admin"));
  });

  it("오퍼레이터 세션이면 throw한다 — 액션은 리다이렉트가 아니라 거부다", async () => {
    getSessionMock.mockResolvedValue(sessionOf("operator"));
    await expect(requireAdminSession()).rejects.toThrow("관리자만 수행할 수 있는 작업입니다.");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("세션이 없으면 throw한다", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireAdminSession()).rejects.toThrow("관리자만 수행할 수 있는 작업입니다.");
  });
});

describe("requireSession / requireSessionOr401 — 역할 무관 로그인 확인", () => {
  it("오퍼레이터도 통과한다(AD-3: 실행 화면은 두 역할 모두에게 열려 있다)", async () => {
    getSessionMock.mockResolvedValue(sessionOf("operator"));
    await expect(requireSession()).resolves.toEqual(sessionOf("operator"));
    await expect(requireSessionOr401()).resolves.toBeNull();
  });

  it("세션이 없으면 401 응답 봉투를 돌려준다", async () => {
    getSessionMock.mockResolvedValue(null);

    const response = await requireSessionOr401();
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({
      error: { code: "unauthorized", message: "로그인이 필요합니다" },
    });
  });
});
