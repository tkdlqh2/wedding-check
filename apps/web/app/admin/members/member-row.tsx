"use client";

import { deactivateMemberAction, reactivateMemberAction, setMemberRoleAction } from "./actions";
import { formatPhoneNumberDisplay } from "@/lib/phone";

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  operator: "오퍼레이터",
};

const ROLE_OPTIONS: { value: "operator" | "admin"; label: string }[] = [
  { value: "operator", label: "오퍼레이터" },
  { value: "admin", label: "관리자" },
];

export function MemberRow({
  member,
  isSelf,
  activeAdminCount,
}: {
  member: { id: string; name: string; phoneNumber: string | null; role: string; banned: boolean };
  isSelf: boolean;
  activeAdminCount: number;
}) {
  const active = !member.banned;
  // Story 5.7 AC 2: 로그인 중인 관리자 자신이 유일한 활성 관리자면 역할 변경 자체를
  // 숨긴다 — better-auth의 setRole에는 banUser의 YOU_CANNOT_BAN_YOURSELF 같은 자기
  // 보호가 없어(lib/services/member.ts의 setMemberRole 참고), 실패할 액션을 아예
  // 보여주지 않는 이 프로젝트의 기존 원칙(비활성화 버튼 숨김과 동일)을 그대로 따른다.
  const isLastActiveAdmin = isSelf && member.role === "admin" && activeAdminCount <= 1;

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
        <div className="member-row__phone">{formatPhoneNumberDisplay(member.phoneNumber)}</div>
      </div>
      <div className="member-row__actions">
        {isLastActiveAdmin ? (
          <span className="member-row__role-locked-hint">
            마지막 활성 관리자는 역할을 변경할 수 없습니다
          </span>
        ) : (
          <div className="member-row__role-segment">
            {ROLE_OPTIONS.map((option) =>
              option.value === member.role ? (
                <span
                  key={option.value}
                  className="member-row__role-segment-btn member-row__role-segment-btn--active"
                >
                  {option.label}
                </span>
              ) : (
                <form key={option.value} action={setMemberRoleAction}>
                  <input type="hidden" name="id" value={member.id} />
                  <input type="hidden" name="role" value={option.value} />
                  <button type="submit" className="member-row__role-segment-btn">
                    {option.label}
                  </button>
                </form>
              ),
            )}
          </div>
        )}

        {active && isSelf ? (
          <span className="member-row__self-badge">Me</span>
        ) : active ? (
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
            <button type="submit" className="member-row__deactivate-btn">
              비활성화
            </button>
          </form>
        ) : (
          <form action={reactivateMemberAction}>
            <input type="hidden" name="id" value={member.id} />
            <button type="submit" className="member-row__reactivate-btn">
              다시 활성화
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
