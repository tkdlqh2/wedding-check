import Link from "next/link";

function pageHref(page: number, showInactive: boolean, search: string): string {
  const params = new URLSearchParams({ page: String(page), showInactive: showInactive ? "1" : "0" });
  if (search) params.set("q", search);
  return `/admin/members?${params.toString()}`;
}

// Story 5.7 AC 5: apps/web/app/admin/ceremonies/ceremony-pagination.tsx와 동일한
// 이전/다음 링크 + "N / totalPages" 구조. showInactive/search를 쿼리에 실어야 필터
// 상태가 페이지 이동 중에도 유지된다.
export function MemberPagination({
  page,
  totalPages,
  showInactive,
  search,
}: {
  page: number;
  totalPages: number;
  showInactive: boolean;
  search: string;
}) {
  if (totalPages <= 1) return null;

  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav className="member-pagination" aria-label="회원 목록 페이지">
      {isFirst ? (
        <span className="member-pagination__btn member-pagination__btn--disabled" aria-disabled="true">
          이전
        </span>
      ) : (
        <Link href={pageHref(page - 1, showInactive, search)} className="member-pagination__btn">
          이전
        </Link>
      )}
      <span className="member-pagination__status">
        {page} / {totalPages}
      </span>
      {isLast ? (
        <span className="member-pagination__btn member-pagination__btn--disabled" aria-disabled="true">
          다음
        </span>
      ) : (
        <Link href={pageHref(page + 1, showInactive, search)} className="member-pagination__btn">
          다음
        </Link>
      )}
    </nav>
  );
}
