import Link from "next/link";

function pageHref(page: number): string {
  return `/admin/ceremonies?page=${page}`;
}

// Story 5.2 AC 3, 4: 날짜 필터가 없을 때만 렌더링되는 페이지네이션. 호출부(page.tsx)가
// date 파라미터 유무를 이미 판단해 필터 중일 때는 이 컴포넌트를 아예 렌더링하지 않는다.
export function CeremonyPagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav className="ceremony-pagination" aria-label="예식 목록 페이지">
      {isFirst ? (
        <span className="ceremony-pagination__btn ceremony-pagination__btn--disabled" aria-disabled="true">
          이전
        </span>
      ) : (
        <Link href={pageHref(page - 1)} className="ceremony-pagination__btn">
          이전
        </Link>
      )}
      <span className="ceremony-pagination__status">
        {page} / {totalPages}
      </span>
      {isLast ? (
        <span className="ceremony-pagination__btn ceremony-pagination__btn--disabled" aria-disabled="true">
          다음
        </span>
      ) : (
        <Link href={pageHref(page + 1)} className="ceremony-pagination__btn">
          다음
        </Link>
      )}
    </nav>
  );
}
