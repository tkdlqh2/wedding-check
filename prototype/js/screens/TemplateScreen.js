// 체크리스트 템플릿 관리 — FR-1(항목 등록), FR-2(시연 영상)
// 주의: 이 화면에는 실제 영상 "업로드" 인터랙션이 없습니다(▶ 시연 영상 배지 표시만 존재).
// FR-2가 요구하는 업로드/재생 확인 플로우는 아직 이 프로토타입에 구현되어 있지 않습니다.
function TemplateScreen({ vals }) {
  const { state: s, set } = vals;
  const { FocusInput, FOCUS_ORANGE, Btn } = window.WC;

  const updStep = (id, patch) => set({ templateSteps: s.templateSteps.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>체크리스트 템플릿</div>
      <div style={{ fontSize: 14, color: '#555', marginTop: 6 }}>단계마다 복수의 체크 항목을 등록합니다. 변경은 이후 생성되는 예식부터 반영됩니다.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
        {s.templateSteps.map((tp, i) => {
          const addItem = () => {
            const t = tp.newItem.trim();
            if (!t) return;
            updStep(tp.id, { items: [...tp.items, { id: 'n' + Date.now(), summary: t, detail: false, video: false }], newItem: '' });
          };
          return (
            <div key={tp.id} style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: '#f7f7f7', borderBottom: '1px solid #e6e6e6' }}>
                <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 9999, background: '#fff', border: '1px solid #e6e6e6', color: '#555', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{tp.name}</span>
                {tp.condition && <span style={{ background: '#fff', border: '1px solid #e6e6e6', color: '#555', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{tp.condition} 계약 시에만</span>}
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>항목 {tp.items.length}개</span>
                <button style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#555' }}>수정</button>
                <button onClick={() => set({ templateSteps: s.templateSteps.filter((x) => x.id !== tp.id) })} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#888' }}>단계 삭제</button>
              </div>
              {tp.items.map((ti) => (
                <div key={ti.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px 12px 58px', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ whiteSpace: 'normal', fontSize: 15, fontWeight: 500 }}>{ti.summary}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
                    {ti.detail && <span style={{ background: '#f7f7f7', border: '1px solid #e6e6e6', color: '#555', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>긴 설명</span>}
                    {ti.video && <span style={{ background: '#eef5fd', color: '#2b82e0', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>▶ 시연 영상</span>}
                    <button style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '5px 9px', fontSize: 12, fontWeight: 600, color: '#555' }}>수정</button>
                    <button onClick={() => updStep(tp.id, { items: tp.items.filter((x) => x.id !== ti.id) })} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '5px 9px', fontSize: 12, fontWeight: 600, color: '#888' }}>삭제</button>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, padding: '10px 20px 12px 58px' }}>
                <FocusInput
                  value={tp.newItem}
                  onChange={(e) => updStep(tp.id, { newItem: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
                  placeholder="이 단계에 체크 항목 추가 — 요약만 필수, 긴 설명·영상은 나중에"
                  style={{ flex: 1, background: '#fff', color: '#1f1f1f', border: '1px dashed #d4d4d4', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }}
                  focusStyle={FOCUS_ORANGE}
                />
                <Btn onClick={addItem} style={{ cursor: 'pointer', background: '#fff', color: '#e8552d', border: '1px solid #e8552d', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600 }} hoverStyle={{ background: '#fdede7' }}>추가</Btn>
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 10, background: '#fff', border: '1px dashed #d4d4d4', borderRadius: 12, padding: '16px 20px' }}>
          <FocusInput
            value={s.newStepName}
            onChange={(e) => set({ newStepName: e.target.value })}
            placeholder="새 단계 이름 (예: 폐식 안내)"
            style={{ flex: 1, background: '#fff', color: '#1f1f1f', border: '1px solid #d4d4d4', borderRadius: 8, padding: '12px 14px', fontSize: 15, outline: 'none' }}
            focusStyle={FOCUS_ORANGE}
          />
          <Btn
            onClick={() => {
              const name = s.newStepName.trim();
              if (!name) return;
              set({ templateSteps: [...s.templateSteps, { id: 'st' + Date.now(), name, condition: null, newItem: '', items: [] }], newStepName: '' });
            }}
            style={{ cursor: 'pointer', background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600 }}
            hoverStyle={{ background: '#d14a26' }}
          >단계 추가</Btn>
        </div>
      </div>
    </div>
  );
}
