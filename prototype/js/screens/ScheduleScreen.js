// 담당 예식 일정 (오퍼레이터) — PRD에는 명시되지 않은 화면입니다. 자세한 내용은 README.md 참고.
function ScheduleScreen({ vals }) {
  const { Btn } = window.WC;
  const [calYear, setCalYear] = React.useState(2026);
  const [calMonth, setCalMonth] = React.useState(7);
  const dayHeads = ['일', '월', '화', '수', '목', '금', '토'];

  const first = new Date(calYear, calMonth - 1, 1);
  const daysIn = new Date(calYear, calMonth, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) {
    const iso = calYear + '-' + String(calMonth).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    cells.push({ d, iso });
  }
  const prev = () => (calMonth === 1 ? (setCalYear(calYear - 1), setCalMonth(12)) : setCalMonth(calMonth - 1));
  const next = () => (calMonth === 12 ? (setCalYear(calYear + 1), setCalMonth(1)) : setCalMonth(calMonth + 1));
  const opWeddings = vals.state.weddings.filter((w) => w.dateIso === vals.opDate);

  return (
    <div style={{ flex: 1, maxWidth: 1024, width: '100%', margin: '0 auto', padding: '24px 20px 60px' }}>
      <Btn onClick={vals.backToRun} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: '#555' }} hoverStyle={{ background: '#f7f7f7' }}>← 진행 화면</Btn>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 16 }}>담당 예식 일정</div>
      <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>날짜를 선택하면 그 날의 담당 예식이 보입니다. ● 표시가 예식이 있는 날입니다.</div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'rgba(0,0,0,0.06) 0px 2px 8px', padding: '20px 24px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn onClick={prev} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, width: 32, height: 32, fontSize: 13, color: '#555', padding: 0, flex: 'none' }} hoverStyle={{ background: '#f7f7f7' }}>◀</Btn>
          <span style={{ fontSize: 16, fontWeight: 700, minWidth: 100, textAlign: 'center' }}>{calYear}년 {calMonth}월</span>
          <Btn onClick={next} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, width: 32, height: 32, fontSize: 13, color: '#555', padding: 0, flex: 'none' }} hoverStyle={{ background: '#f7f7f7' }}>▶</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginTop: 14 }}>
          {dayHeads.map((dh) => <div key={dh} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#bcbcbc', padding: '2px 0' }}>{dh}</div>)}
          {cells.map((c, idx) => {
            if (!c) return <div key={idx} />;
            const sel = vals.opDate === c.iso;
            const has = vals.state.weddings.some((w) => w.dateIso === c.iso);
            return (
              <Btn key={c.iso} onClick={() => vals.setOpDate(c.iso)} style={{ cursor: 'pointer', border: 'none', borderRadius: 8, height: 48, fontSize: 15, fontWeight: 600, background: sel ? '#e8552d' : 'transparent', color: sel ? '#ffffff' : '#1f1f1f', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }} hoverStyle={{ outline: '1px solid #e8552d' }}>
                <span>{c.d}</span>
                <span style={{ fontSize: 8, lineHeight: 1, color: sel ? '#ffffff' : has ? '#e8552d' : 'transparent' }}>●</span>
              </Btn>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 12px' }}>{parseInt(vals.opDate.slice(5, 7))}월 {parseInt(vals.opDate.slice(8))}일 예식</div>
      {opWeddings.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d4d4d4', borderRadius: 12, padding: 32, textAlign: 'center', color: '#888', fontSize: 15 }}>이 날짜에 예식이 없습니다.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {opWeddings.map((w) => {
          const [statusColor, statusLabel, badgeBg, badgeFg] = vals.statusMap[w.status];
          return (
            <div key={w.id} style={{ background: '#fff', borderRadius: 8, borderLeft: '4px solid ' + statusColor, boxShadow: 'rgba(0,0,0,0.06) 0px 2px 8px', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{w.time} <span style={{ fontSize: 16, fontWeight: 600 }}>{w.couple}</span></div>
                <div style={{ fontSize: 14, color: '#888', marginTop: 2 }}>{w.hall} · {vals.contractLabel(w.contract)} · 담당 {w.assignees.length ? w.assignees.join(', ') : '미배정'}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ background: badgeBg, color: badgeFg, borderRadius: 4, padding: '3px 10px', fontSize: 13, fontWeight: 600 }}>{statusLabel}</span>
                <Btn onClick={() => vals.openRun(w.id)} style={{ cursor: 'pointer', background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontSize: 15, fontWeight: 600 }} hoverStyle={{ background: '#d14a26' }}>체크리스트 열기</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
