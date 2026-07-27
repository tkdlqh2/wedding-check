"use client";

import { deactivateMemberAction, reactivateMemberAction } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  operator: "오퍼레이터",
};

export function MemberRow({
  member,
}: {
  member: { id: string; name: string; phoneNumber: string | null; role: string; banned: boolean };
}) {
  const active = !member.banned;

  return (
    <li className={"member-row" + (active ? "" : " member-row--inactive")}>
      <span className="member-row__avatar" aria-hidden="true">
        {member.name.charAt(0)}
      </span>
      <div className="member-row__info">
        <div className="member-row__name-line">
          <span className="member-row__name">{member.name}</span>
          <span
            className={
              "member-row__role-badge" +
              (member.role === "admin" ? " member-row__role-badge--admin" : "")
            }
          >
            {ROLE_LABEL[member.role] ?? member.role}
          </span>
          {!active && <span className="member-row__status-badge">비활성</span>}
        </div>
        <div className="member-row__phone">{member.phoneNumber ?? "전화번호 미등록"}</div>
      </div>
      <div className="member-row__actions">
        {active ? (
          <form
            action={deactivateMemberAction}
            onSubmit={(e) => {
              if (
                !confirm(
                  `"${member.name}" 계정을 비활성화할까요? 이 계정은 더 이상 로그인할 수 없습니다.`,
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={member.id} />
            <button type="submit" className="btn-secondary">
              비활성화
            </button>
          </form>
        ) : (
          <form action={reactivateMemberAction}>
            <input type="hidden" name="id" value={member.id} />
            <button type="submit" className="btn-secondary">
              다시 활성화
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
