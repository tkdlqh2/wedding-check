// 관리자 화면 셸 — 상단 탭 + 새 예식 등록 CTA, 아래에 탭별 화면을 라우팅합니다.
function AdminScreen({ vals }) {
  const { state: s, set } = vals;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#fff', boxShadow: 'rgba(0,0,0,0.06) 0px 1px 4px', position: 'sticky', top: 41, zIndex: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 28, height: 60 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8552d' }}>웨딩체크 <span style={{ color: '#888', fontSize: 12, fontWeight: 400 }}>관리자</span></div>
          <div style={{ display: 'flex', gap: 4 }}>
            {vals.adminTabs.map(([id, label]) => (
              <button key={id} onClick={() => set({ adminTab: id, detailId: null })} style={{ cursor: 'pointer', background: s.adminTab === id ? '#fdede7' : 'transparent', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 15, fontWeight: 600, color: s.adminTab === id ? '#e8552d' : '#555555' }}>{label}</button>
            ))}
          </div>
          <button onClick={vals.goNewWedding} style={{ marginLeft: 'auto', cursor: 'pointer', background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 15, fontWeight: 600 }}>새 예식 등록</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', padding: '28px 24px 60px' }}>
        {vals.isTabTemplate && <TemplateScreen vals={vals} />}
        {vals.isTabWedding && <WeddingScreen vals={vals} />}
        {vals.isDetail && <WeddingDetailScreen vals={vals} />}
        {vals.isTabMember && <MemberScreen vals={vals} />}
        {vals.isTabInsight && <InsightScreen vals={vals} />}
      </div>
    </div>
  );
}
