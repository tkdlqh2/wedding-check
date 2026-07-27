import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listMembers } from "@/lib/services/member";
import { MemberForm } from "./member-form";
import { MemberRow } from "./member-row";
import "./members.css";

export default async function MembersPage() {
  const [members, session] = await Promise.all([
    listMembers(),
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
        관리자가 직접 오퍼레이터 계정을 등록하고, 퇴사·휴직 시 비활성화합니다. 비활성화된
        계정은 로그인할 수 없습니다.
      </p>

      <div className="members-page__grid">
        <div className="members-page__form-card">
          <h2>회원 등록</h2>
          <MemberForm />
        </div>

        {members.length === 0 ? (
          <p className="members-page__empty">등록된 회원이 없습니다. 왼쪽에서 첫 계정을 등록해보세요.</p>
        ) : (
          <ul className="member-list">
            {members.map((member) => (
              <MemberRow key={member.id} member={member} isSelf={member.id === currentUserId} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
