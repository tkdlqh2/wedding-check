import { listMembers } from "@/lib/services/member";
import { MemberForm } from "./member-form";
import { MemberRow } from "./member-row";
import "./members.css";

export default async function MembersPage() {
  const members = await listMembers();

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
              <MemberRow key={member.id} member={member} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
