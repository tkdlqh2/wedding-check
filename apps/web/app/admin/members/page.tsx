import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listMembersPaginated } from "@/lib/services/member";
import { MemberForm } from "./member-form";
import { MemberRow } from "./member-row";
import { MemberPagination } from "./member-pagination";
import "./members.css";

const PAGE_SIZE = 10;

function parsePageParam(value: string | undefined): number {
  const page = value ? Number(value) : 1;
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

// Story 5.7 AC 4: 필터가 바뀌면 총 페이지 수도 바뀌므로 토글 시 항상 page=1로 리셋한다.
// 이름 검색어(q)가 있으면 토글 후에도 검색이 유지되도록 그대로 실어 보낸다.
function toggleShowInactiveHref(showInactive: boolean, search: string): string {
  const params = new URLSearchParams({ page: "1", showInactive: showInactive ? "0" : "1" });
  if (search) params.set("q", search);
  return `/admin/members?${params.toString()}`;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; showInactive?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const showInactive = params.showInactive === "1";
  const search = (params.q ?? "").trim();

  const [result, session] = await Promise.all([
    listMembersPaginated({ page, pageSize: PAGE_SIZE, showInactive, search: search || undefined }),
    auth.api.getSession({ headers: await headers() }),
  ]);
  // 코덱스 리뷰 P2: better-auth의 banUser는 호출자가 자기 자신을 비활성화하려 하면
  // YOU_CANNOT_BAN_YOURSELF로 거부한다 — 로그인 중인 관리자 자신의 행에는 비활성화
  // 버튼을 아예 숨겨서, 눌러도 실패하는 액션을 보여주지 않는다.
  const currentUserId = session?.user.id;

  return (
    <section className="members-page">
      <h1>회원 관리</h1>
      <p className="members-page__description">
        관리자가 직접 오퍼레이터·관리자 계정을 등록하고, 퇴사·휴직 시 비활성화합니다. 비활성화된
        계정은 로그인할 수 없습니다.
      </p>

      <div className="members-page__grid">
        <div className="members-page__form-card">
          <h2>회원 등록</h2>
          <MemberForm />
        </div>

        <div className="members-page__list-column">
          <form action="/admin/members" method="GET" className="members-page__search">
            <input type="hidden" name="showInactive" value={showInactive ? "1" : "0"} />
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="이름으로 검색"
              className="members-page__search-input"
            />
            <button type="submit" className="btn-secondary">
              검색
            </button>
          </form>

          <div className="members-page__summary">
            <span className="members-page__summary-total">전체 {result.totalCount}명</span>
            <span className="members-page__summary-breakdown">
              활성 {result.activeCount}명 · 비활성 {result.inactiveCount}명
            </span>
            <Link
              href={toggleShowInactiveHref(showInactive, search)}
              className="members-page__summary-toggle"
            >
              {showInactive ? "비활성 숨기기" : "비활성 보기"}
            </Link>
          </div>

          {result.members.length === 0 ? (
            <p className="members-page__empty">
              {search
                ? `"${search}"와 일치하는 회원이 없습니다.`
                : showInactive
                  ? "등록된 회원이 없습니다. 왼쪽에서 첫 계정을 등록해보세요."
                  : "표시할 활성 회원이 없습니다."}
            </p>
          ) : (
            <ul className="member-list">
              {result.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isSelf={member.id === currentUserId}
                  activeAdminCount={result.activeAdminCount}
                />
              ))}
            </ul>
          )}

          <MemberPagination
            page={result.page}
            totalPages={result.totalPages}
            showInactive={showInactive}
            search={search}
          />
        </div>
      </div>
    </section>
  );
}
