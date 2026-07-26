// 예식 상세 — 예식 1건 전용 체크리스트 인스턴스 편집
// FR-4: "인스턴스 생성 후 수동으로 항목을 추가/제외하는 것도 가능하다 (당일 변경 대응)".
// 그래서 upcoming(예정)뿐 아니라 ongoing(진행중)에도 편집을 허용합니다 — done(종료)에만 잠급니다.
function WeddingDetailScreen({ vals }) {
  const { state: s, set } = vals;
  const { FocusInput, FOCUS_ORANGE, Btn } = window.WC;
  const w = s.weddings.find((x) => x.id === s.detailId);
  if (!w) return null;

  const editable = w.status !== 'done';
  const [, statusLabel, badgeBg, badgeFg] = vals.statusMap[w.status];
  const setW = (patch) => set({ weddings: s.weddings.map((x) => (x.id === w.id ? { ...x, ...patch } : x)) });

  return (
    <div>
      <Btn onClick={() => set({ detailId: null })} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: '#555' }} hoverStyle={{ background: '#f7f7f7' }}>← 예식 목록</Btn>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{w.time} {w.couple}</div>
        <span style={{ background: badgeBg, color: badgeFg, borderRadius: 4, padding: '3px 10px', fontSize: 13, fontWeight: 600 }}>{statusLabel}</span>
        <span style={{ fontSize: 12, color: '#888' }}>상태는 오퍼레이터가 현장에서 변경합니다</span>
      </div>
      <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>{w.date} · {w.hall} · 담당 {w.assignees.length ? w.assignees.join(', ') : '미배정'}</div>

      {editable ? (
        <div style={{ fontSize: 14, color: '#555', marginTop: 12, background: '#fdf3e0', border: '1px solid #f5a623', borderRadius: 8, padding: '10px 14px', display: 'inline-block' }}>이 예식 전용 체크리스트입니다 — 여기서의 수정은 <strong>이 예식에만</strong> 반영되고 템플릿은 바뀌지 않습니다.</div>
      ) : (
        <div style={{ fontSize: 14, color: '#888', marginTop: 12, background: '#f7f7f7', border: '1px solid #e6e6e6', borderRadius: 8, padding: '10px 14px', display: 'inline-block' }}>종료된 예식은 체크리스트를 수정할 수 없습니다 — 읽기 전용.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
        {(w.instSteps || []).map((tp, i) => {
          const updStep = (patch) => setW({ instSteps: w.instSteps.map((x) => (x.id === tp.id ? { ...x, ...patch } : x)) });
          const addItem = () => {
            const t = tp.newItem.trim();
            if (!t) return;
            updStep({ items: [...tp.items, { id: 'di' + Date.now(), summary: t, detail: false, video: false }], newItem: '' });
          };
          return (
            <div key={tp.id} style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: '#f7f7f7', borderBottom: '1px solid #e6e6e6' }}>
                <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 9999, background: '#fff', border: '1px solid #e6e6e6', color: '#555', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{tp.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>항목 {tp.items.length}개</span>
                {editable && (
                  <>
                    <button style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#555' }}>수정</button>
                    <button onClick={() => setW({ instSteps: w.instSteps.filter((x) => x.id !== tp.id) })} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#888' }}>단계 삭제</button>
                  </>
                )}
              </div>
              {tp.items.map((ti) => (
                <div key={ti.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px 12px 58px', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ whiteSpace: 'normal', fontSize: 15, fontWeight: 500 }}>{ti.summary}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
                    {ti.video && <span style={{ background: '#eef5fd', color: '#2b82e0', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>▶ 시연 영상</span>}
                    {editable && (
                      <>
                        <button style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '5px 9px', fontSize: 12, fontWeight: 600, color: '#555' }}>수정</button>
                        <button onClick={() => updStep({ items: tp.items.filter((x) => x.id !== ti.id) })} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '5px 9px', fontSize: 12, fontWeight: 600, color: '#888' }}>삭제</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {editable && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 20px 12px 58px' }}>
                  <FocusInput
                    value={tp.newItem}
                    onChange={(e) => updStep({ newItem: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
                    placeholder="이 예식에만 필요한 체크 항목 추가"
                    style={{ flex: 1, background: '#fff', color: '#1f1f1f', border: '1px dashed #d4d4d4', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }}
                    focusStyle={FOCUS_ORANGE}
                  />
                  <Btn onClick={addItem} style={{ cursor: 'pointer', background: '#fff', color: '#e8552d', border: '1px solid #e8552d', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600 }} hoverStyle={{ background: '#fdede7' }}>추가</Btn>
                </div>
              )}
            </div>
          );
        })}
        {editable && (
          <div style={{ display: 'flex', gap: 10, background: '#fff', border: '1px dashed #d4d4d4', borderRadius: 12, padding: '16px 20px' }}>
            <FocusInput
              value={s.dwNewStep}
              onChange={(e) => set({ dwNewStep: e.target.value })}
              placeholder="이 예식에만 추가할 단계 (예: 신부 어머니 축사)"
              style={{ flex: 1, background: '#fff', color: '#1f1f1f', border: '1px solid #d4d4d4', borderRadius: 8, padding: '12px 14px', fontSize: 15, outline: 'none' }}
              focusStyle={FOCUS_ORANGE}
            />
            <Btn
              onClick={() => {
                const name = s.dwNewStep.trim();
                if (!name) return;
                setW({ instSteps: [...(w.instSteps || []), { id: 'ds' + Date.now(), name, newItem: '', items: [] }] });
                set({ dwNewStep: '' });
              }}
              style={{ cursor: 'pointer', background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600 }}
              hoverStyle={{ background: '#d14a26' }}
            >단계 추가</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
