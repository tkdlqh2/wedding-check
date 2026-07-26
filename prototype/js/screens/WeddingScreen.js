// 예식 등록 및 목록 — FR-3(예식 등록), FR-4(계약 형태별 자동 조합)
function WeddingScreen({ vals }) {
  const { state: s, set } = vals;
  const { FocusInput, FOCUS_ORANGE, Btn } = window.WC;
  const [filterDate, setFilterDate] = React.useState(null);
  const [calYear, setCalYear] = React.useState(2026);
  const [calMonth, setCalMonth] = React.useState(7);
  const dayHeads = ['일', '월', '화', '수', '목', '금', '토'];

  const prev = () => (calMonth === 1 ? (setCalYear(calYear - 1), setCalMonth(12)) : setCalMonth(calMonth - 1));
  const next = () => (calMonth === 12 ? (setCalYear(calYear + 1), setCalMonth(1)) : setCalMonth(calMonth + 1));
  const first = new Date(calYear, calMonth - 1, 1);
  const daysIn = new Date(calYear, calMonth, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push({ d, iso: calYear + '-' + String(calMonth).padStart(2, '0') + '-' + String(d).padStart(2, '0') });

  const registerWedding = () => {
    if (!s.nwCouple.trim()) { set({ nwError: true }); return; }
    const d = new Date(s.nwDate + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    set({
      weddings: [{ id: 'w' + Date.now(), time: s.nwTime, couple: s.nwCouple.trim(), date: (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + days[d.getDay()] + ')', dateIso: s.nwDate, hall: s.nwHall, assignees: [], contract: { ...s.nwContract }, status: 'upcoming', progress: '시작 전 · ' + vals.countFor(s.nwContract) + '개 항목' }, ...s.weddings],
      nwCouple: '',
    });
  };

  const openDetail = (w) => {
    if (!w.instSteps) {
      const inst = s.templateSteps.filter((tp) => !tp.condition || w.contract[tp.condition]).map((tp) => ({ id: w.id + tp.id, name: tp.name, newItem: '', items: tp.items.map((ti) => ({ ...ti, id: w.id + ti.id })) }));
      set({ weddings: s.weddings.map((x) => (x.id === w.id ? { ...x, instSteps: inst } : x)), detailId: w.id, dwNewStep: '' });
    } else set({ detailId: w.id, dwNewStep: '' });
  };

  const listTitle = filterDate ? parseInt(filterDate.slice(5, 7)) + '월 ' + parseInt(filterDate.slice(8)) + '일 예식' : '등록된 예식';
  const filtered = s.weddings.filter((w) => !filterDate || w.dateIso === filterDate);

  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>예식 등록</div>
      <div style={{ fontSize: 14, color: '#555', marginTop: 6 }}>예식을 등록하면 계약 형태에 맞는 항목만 조합된 전용 체크리스트가 자동 생성됩니다.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, marginTop: 20, alignItems: 'start' }}>

        <div style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>새 예식</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 16 }}>날짜 · 시간</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input type="date" value={s.nwDate} onChange={(e) => set({ nwDate: e.target.value })} style={{ flex: 1, border: '1px solid #d4d4d4', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
            <input type="time" value={s.nwTime} onChange={(e) => set({ nwTime: e.target.value })} style={{ width: 110, border: '1px solid #d4d4d4', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 14 }}>홀</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {['그랜드홀', '가든홀', '컨벤션홀'].map((h) => (
              <button key={h} onClick={() => set({ nwHall: h })} style={{ cursor: 'pointer', borderRadius: 9999, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: s.nwHall === h ? '#fdede7' : '#ffffff', border: s.nwHall === h ? '1px solid #e8552d' : '1px solid #d4d4d4', color: '#1f1f1f' }}>{h}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 14, background: '#f7f7f7', borderRadius: 8, padding: '10px 12px' }}>담당 오퍼레이터는 등록 후 스케줄을 짤 때 예식 카드에서 배정합니다.</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 14 }}>신랑 · 신부</div>
          <FocusInput
            value={s.nwCouple}
            onChange={(e) => set({ nwCouple: e.target.value, nwError: false })}
            placeholder="예: 박준호 · 최지우"
            style={{ width: '100%', marginTop: 6, border: '1px solid ' + (s.nwError ? '#e0353b' : '#d4d4d4'), borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }}
            focusStyle={FOCUS_ORANGE}
          />
          {s.nwError && <div style={{ fontSize: 12, color: '#e0353b', marginTop: 4 }}>신랑 · 신부 이름을 입력해주세요.</div>}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 14 }}>계약 형태</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {vals.contractOrder.map((k) => (
              <button key={k} onClick={() => set({ nwContract: { ...s.nwContract, [k]: !s.nwContract[k] } })} style={{ cursor: 'pointer', borderRadius: 9999, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: s.nwContract[k] ? '#fdede7' : '#ffffff', border: s.nwContract[k] ? '1px solid #e8552d' : '1px solid #d4d4d4', color: '#1f1f1f' }}>{k === '주례' ? '주례 있음' : k === '이벤트' ? '특별 이벤트' : '축가'}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 14, background: '#f7f7f7', borderRadius: 8, padding: '10px 12px' }}>이 계약 형태로 등록하면 체크리스트 <strong style={{ color: '#1f1f1f' }}>{vals.countFor(s.nwContract)}개 항목</strong>이 자동 조합됩니다.</div>
          <Btn onClick={registerWedding} style={{ width: '100%', marginTop: 16, cursor: 'pointer', background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 16, fontWeight: 600 }} hoverStyle={{ background: '#d14a26' }}>예식 등록하기</Btn>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>날짜로 필터</span>
              <span style={{ fontSize: 12, color: '#888' }}>● 표시가 예식이 있는 날입니다</span>
              {filterDate && (
                <Btn onClick={() => setFilterDate(null)} style={{ marginLeft: 'auto', cursor: 'pointer', background: '#fdede7', border: '1px solid #e8552d', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#e8552d' }} hoverStyle={{ background: '#fbdccf' }}>
                  {parseInt(filterDate.slice(5, 7))}월 {parseInt(filterDate.slice(8))}일 ✕ 전체 보기
                </Btn>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <Btn onClick={prev} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, width: 28, height: 28, fontSize: 13, color: '#555', padding: 0, flex: 'none' }} hoverStyle={{ background: '#f7f7f7' }}>◀</Btn>
              <span style={{ fontSize: 14, fontWeight: 700, minWidth: 90, textAlign: 'center' }}>{calYear}년 {calMonth}월</span>
              <Btn onClick={next} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, width: 28, height: 28, fontSize: 13, color: '#555', padding: 0, flex: 'none' }} hoverStyle={{ background: '#f7f7f7' }}>▶</Btn>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {dayHeads.map((dh) => <div key={dh} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#bcbcbc', padding: '2px 0' }}>{dh}</div>)}
                {cells.map((c, idx) => {
                  if (!c) return <div key={idx} />;
                  const sel = filterDate === c.iso;
                  const has = s.weddings.some((w) => w.dateIso === c.iso);
                  return (
                    <Btn key={c.iso} onClick={() => setFilterDate(filterDate === c.iso ? null : c.iso)} style={{ cursor: 'pointer', border: 'none', borderRadius: 6, height: 34, fontSize: 13, fontWeight: 600, background: sel ? '#e8552d' : 'transparent', color: sel ? '#ffffff' : '#1f1f1f', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }} hoverStyle={{ outline: '1px solid #e8552d' }}>
                      <span>{c.d}</span>
                      <span style={{ fontSize: 7, lineHeight: 1, color: sel ? '#ffffff' : has ? '#e8552d' : 'transparent' }}>●</span>
                    </Btn>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 16, fontWeight: 700 }}>{listTitle} <span style={{ color: '#888', fontWeight: 400, fontSize: 13 }}>인스턴스는 예식마다 독립적입니다</span></div>
          {filterDate && filtered.length === 0 && (
            <div style={{ background: '#fff', border: '1px dashed #d4d4d4', borderRadius: 12, padding: 28, textAlign: 'center', color: '#888', fontSize: 14 }}>이 날짜에 등록된 예식이 없습니다.</div>
          )}
          {filtered.map((w) => {
            const [statusColor, statusLabel, badgeBg, badgeFg] = vals.statusMap[w.status];
            const progress = w.id === s.runWeddingId ? vals.doneCount + ' / ' + vals.totalCount + ' 체크' : w.progress;
            return (
              <div key={w.id} style={{ background: '#fff', borderRadius: 8, borderLeft: '4px solid ' + statusColor, boxShadow: 'rgba(0,0,0,0.06) 0px 2px 8px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{w.time} <span style={{ fontSize: 15, fontWeight: 600 }}>{w.couple}</span></div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{w.date} · {w.hall} · {vals.contractLabel(w.contract)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#888' }}>담당</span>
                    {s.members.filter((m) => m.active && m.role === '오퍼레이터').map((m) => {
                      const sel = w.assignees.includes(m.name);
                      return (
                        <button key={m.id} onClick={() => set({ weddings: s.weddings.map((x) => (x.id === w.id ? { ...x, assignees: sel ? x.assignees.filter((n) => n !== m.name) : [...x.assignees, m.name] } : x)) })} style={{ cursor: 'pointer', borderRadius: 9999, padding: '5px 12px', fontSize: 12, fontWeight: 600, background: sel ? '#fdede7' : '#ffffff', border: sel ? '1px solid #e8552d' : '1px solid #d4d4d4', color: sel ? '#e8552d' : '#888888' }}>{m.name}</button>
                      );
                    })}
                    {w.assignees.length === 0 && <span style={{ fontSize: 12, color: '#e0353b', fontWeight: 600 }}>미배정</span>}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: '#888' }}>체크리스트</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{progress}</div>
                  </div>
                  <span style={{ background: badgeBg, color: badgeFg, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{statusLabel}</span>
                  <Btn onClick={() => openDetail(w)} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#555' }} hoverStyle={{ background: '#f7f7f7' }}>상세</Btn>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
