// 빈도 기반 인사이트 (읽기 전용) — FR-9(반복 패턴 클러스터링), FR-10(관리자 전용)
// 주의: 여기 목록은 정적 시드 데이터입니다. 실제 클러스터링 연산은 보여주지 않습니다.
// FR-10(신입 계정 접근 차단)도 이 프로토타입에는 실제 로그인/권한 체크가 없어 구현되어 있지 않습니다.
function InsightScreen({ vals }) {
  const { state: s, set } = vals;
  const stats = [
    { label: '누적 피드백', value: '23건' },
    { label: '반복 원인 클러스터', value: '3개' },
    { label: '이번 달 신입 동반 예식', value: '12회' },
  ];

  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>
        인사이트 <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#888', borderRadius: 4, padding: '2px 8px', verticalAlign: 'middle' }}>관리자 전용 · 읽기 전용</span>
      </div>
      <div style={{ fontSize: 14, color: '#555', marginTop: 6 }}>누적 피드백을 의미 기반으로 묶었습니다. 표현이 달라도 같은 원인이면 하나로 집계됩니다. 매일 새벽 1회 갱신 · 마지막 갱신 오늘 05:00</div>

      <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
        {stats.map((st) => (
          <div key={st.label} style={{ flex: 1, minWidth: 180, background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, color: '#888' }}>{st.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{st.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
        {s.insights.map((ins, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, overflow: 'hidden' }}>
            <button
              onClick={() => set({ insights: s.insights.map((x, j) => (j === i ? { ...x, expanded: !x.expanded } : x)) })}
              style={{ whiteSpace: 'normal', width: '100%', textAlign: 'left', cursor: 'pointer', background: '#fff', border: 'none', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <span style={{ flex: 'none', fontSize: 24, fontWeight: 700, color: '#e8552d', minWidth: 64 }}>{ins.count}회</span>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{ins.title}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{ins.sub}</div>
              </div>
              <span style={{ marginLeft: 'auto', color: '#888', fontSize: 13, fontWeight: 600 }}>{ins.expanded ? '▲' : '▼'} 원본 피드백</span>
            </button>
            {ins.expanded && (
              <div style={{ borderTop: '1px solid #e6e6e6', background: '#f7f7f7', padding: '8px 24px 16px' }}>
                {ins.feedbacks.map((fb, j) => (
                  <div key={j} style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
                    <div style={{ fontSize: 14, color: '#555', lineHeight: 1.5 }}>"{fb.text}"</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{fb.meta}</div>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: '#888', marginTop: 10 }}>템플릿 반영 여부는 사람이 판단합니다 — 자동 반영은 v2에서 다룹니다.</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
