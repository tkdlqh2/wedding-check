// 회원 관리 — 주의: PRD §4 Features 어디에도 "회원/계정 관리" FR이 없습니다.
// 로그인·역할 구분(FR-10 신입/관리자 접근 제어)의 전제가 되는 화면이라 실무상 필요하다고 판단해
// 프로토타입에는 유지하되, PRD에는 아직 정식 스펙(FR)으로 반영되어 있지 않다는 점을 화면에도 표시합니다.
function MemberScreen({ vals }) {
  const { state: s, set } = vals;
  const { FocusInput, FOCUS_ORANGE, Btn } = window.WC;

  const registerMember = () => {
    if (!s.nmName.trim()) { set({ nmError: true }); return; }
    set({ members: [{ id: 'm' + Date.now(), name: s.nmName.trim(), phone: s.nmPhone.trim() || '연락처 미입력', role: s.nmRole, since: '2026년 7월 입사', active: true }, ...s.members], nmName: '', nmPhone: '' });
  };

  const activeCount = s.members.filter((m) => m.active).length;
  const inactiveCount = s.members.filter((m) => !m.active).length;
  const rows = s.members.filter((m) => s.showInactive || m.active);

  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>
        회원 관리 <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#888', borderRadius: 4, padding: '2px 8px', verticalAlign: 'middle' }}>PRD 범위 밖 · 별도 스펙 필요</span>
      </div>
      <div style={{ fontSize: 14, color: '#555', marginTop: 6 }}>사내 시스템입니다 — 관리자가 직접 등록하고, 퇴사·휴직 시 비활성 처리합니다. 비활성 회원은 로그인할 수 없습니다.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, marginTop: 20, alignItems: 'start' }}>

        <div style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>회원 등록</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 16 }}>이름</div>
          <FocusInput
            value={s.nmName}
            onChange={(e) => set({ nmName: e.target.value, nmError: false })}
            placeholder="예: 홍길동"
            style={{ width: '100%', marginTop: 6, border: '1px solid ' + (s.nmError ? '#e0353b' : '#d4d4d4'), borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }}
            focusStyle={FOCUS_ORANGE}
          />
          {s.nmError && <div style={{ fontSize: 12, color: '#e0353b', marginTop: 4 }}>이름을 입력해주세요.</div>}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 14 }}>연락처</div>
          <FocusInput
            value={s.nmPhone}
            onChange={(e) => set({ nmPhone: e.target.value })}
            placeholder="010-0000-0000"
            style={{ width: '100%', marginTop: 6, border: '1px solid #d4d4d4', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }}
            focusStyle={FOCUS_ORANGE}
          />
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 14 }}>역할</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {['오퍼레이터', '관리자'].map((r) => (
              <button key={r} onClick={() => set({ nmRole: r })} style={{ cursor: 'pointer', borderRadius: 9999, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: s.nmRole === r ? '#fdede7' : '#ffffff', border: s.nmRole === r ? '1px solid #e8552d' : '1px solid #d4d4d4', color: '#1f1f1f' }}>{r}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 14, background: '#f7f7f7', borderRadius: 8, padding: '10px 12px' }}>등록하면 초기 비밀번호가 문자로 발송됩니다. 첫 로그인 시 변경이 필요합니다.</div>
          <Btn onClick={registerMember} style={{ width: '100%', marginTop: 16, cursor: 'pointer', background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 16, fontWeight: 600 }} hoverStyle={{ background: '#d14a26' }}>회원 등록하기</Btn>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: '#f7f7f7', borderBottom: '1px solid #e6e6e6' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>전체 {s.members.length}명</span>
            <span style={{ fontSize: 13, color: '#888' }}>활성 {activeCount}명 · 비활성 {inactiveCount}명</span>
            <button onClick={() => set({ showInactive: !s.showInactive })} style={{ marginLeft: 'auto', cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#555' }}>{s.showInactive ? '비활성 숨기기' : '비활성 보기'}</button>
          </div>
          {rows.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: '1px solid #f0f0f0', opacity: m.active ? 1 : 0.55 }}>
              <span style={{ flex: 'none', width: 38, height: 38, borderRadius: 9999, background: m.active ? (m.role === '관리자' ? '#e8552d' : '#2b82e0') : '#bcbcbc', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>{m.name[0]}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {m.name} <span style={{ fontSize: 12, fontWeight: 600, color: m.role === '관리자' ? '#e8552d' : '#2b82e0', background: m.role === '관리자' ? '#fdede7' : '#eef5fd', borderRadius: 4, padding: '2px 8px', marginLeft: 4 }}>{m.role}</span>
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{m.phone} · {m.since}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
                {!m.active && <span style={{ background: '#f7f7f7', border: '1px solid #e6e6e6', color: '#888', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>비활성</span>}
                <div style={{ display: 'flex', border: '1px solid #d4d4d4', borderRadius: 6, overflow: 'hidden' }}>
                  {['오퍼레이터', '관리자'].map((r) => (
                    <button key={r} onClick={() => set({ members: s.members.map((x) => (x.id === m.id ? { ...x, role: r } : x)) })} style={{ cursor: 'pointer', border: 'none', padding: '7px 12px', fontSize: 13, fontWeight: 600, background: m.role === r ? '#1f1f1f' : '#ffffff', color: m.role === r ? '#ffffff' : '#888888' }}>{r}</button>
                  ))}
                </div>
                <Btn
                  onClick={() => set({ members: s.members.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)) })}
                  style={{ cursor: 'pointer', background: '#fff', border: '1px solid ' + (m.active ? '#e8b4b6' : '#a8d8be'), borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: m.active ? '#e0353b' : '#1fa463' }}
                  hoverStyle={{ background: '#f7f7f7' }}
                >{m.active ? '비활성 처리' : '다시 활성화'}</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
