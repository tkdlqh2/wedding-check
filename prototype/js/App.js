// 웨딩체크 프로토타입 — 최상위 컴포넌트
// 상태 전체를 여기서 들고, 화면별로 필요한 계산값(vals)을 만들어 각 스크린 컴포넌트에 통째로 내려줍니다.
// (원본 dc.html의 renderVals() 패턴을 그대로 유지 — 화면 파일들은 거의 "표현"만 담당합니다.)

function App() {
  const [state, setState] = React.useState(window.WC_INITIAL_STATE);
  const set = (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  const s = state;
  const { statusMap, contractOrder, contractLabel, countFor, Spinner } = window.WC;

  // ===== FR-5/FR-6: 실행 중 자연어 질의 =====
  // 주의: 아래는 키워드 포함 매칭 목업입니다. PRD는 "의미 기반" 매칭을 요구하므로
  // 실제 구현에서는 이 부분을 임베딩 기반 유사도 검색으로 교체해야 합니다.
  const runQuery = () => {
    const q = s.queryText.trim();
    if (!q || s.queryLoading) return;
    set({ queryLoading: true, queryResult: null });
    setTimeout(() => {
      setState((cur) => {
        const scored = cur.cases
          .map((c) => ({ c, hits: c.kw.filter((k) => q.includes(k)).length }))
          .filter((x) => x.hits > 0)
          .sort((a, b) => b.hits - a.hits || b.c.sim - a.c.sim)
          .slice(0, 3); // FR-6 assumption: 유사 사례 상한 3건
        return { ...cur, queryLoading: false, queryResult: scored.length ? { matches: scored.map((x) => x.c) } : { none: true } };
      });
    }, 1100);
  };

  // ===== FR-7/FR-8: 예식 후 피드백 자동 구조화 =====
  // 주의: 아래는 정규식 기반 목업 구조화입니다. 실제 FR-8은 LLM 기반 자동 구조화를 요구합니다.
  const structureFb = () => {
    const t = s.fbText.trim();
    if (!t || s.fbLoading) return;
    set({ fbLoading: true, fbPreview: null, fbSaved: false, fbDraftSaved: false });
    setTimeout(() => {
      setState((cur) => {
        const sents = t.split(/(?<=[.다요함음됨])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
        const situation = sents[0] || t;
        const judgeSent = sents.find((x) => /야 함|야 했|해야|했어야|미리|필요/.test(x) && x !== situation);
        const bad = /당황|늦|놓치|실수|잘못|어두|안 나|안나/.test(t);
        let step = cur.fbStep;
        if (!step) {
          if (/축가|반주|MR/i.test(t)) step = '축가';
          else if (/주례|목사|선언/.test(t)) step = '주례사';
          else if (/입장/.test(t)) step = '신부 입장';
          else if (/영상|화면|스크린/.test(t)) step = '식전 준비';
          else step = '기타';
        }
        const tagMap = [['축가|반주|MR', '축가'], ['음향|볼륨|마이크', '음향'], ['조명|스팟', '조명'], ['영상|화면|스크린|HDMI', '영상'], ['주례|목사', '주례'], ['순서|애드리브|즉흥', '순서변경']];
        const tags = tagMap.filter(([re]) => new RegExp(re, 'i').test(t)).map(([, tag]) => tag);
        if (!tags.length) tags.push('변수상황');
        return {
          ...cur,
          fbLoading: false,
          fbPreview: {
            step, situation,
            judgment: judgeSent || '같은 상황이 오면 해당 큐를 미리 걸어두고 대기한다.',
            result: bad ? '잘못 대처됨' : '잘 대처됨',
            tags: tags.join(', '),
          },
        };
      });
    }, 1200);
  };

  const view = s.view ?? window.WC_CONFIG.startView;
  const allItems = s.steps.flatMap((st) => st.items);
  const doneCount = allItems.filter((i) => i.done).length;
  const stepNames = [...s.steps.map((x) => x.name), '기타'];
  const fbSet = (key, val) => set({ fbPreview: { ...s.fbPreview, [key]: val } });

  // 현재 실행 화면에 열려 있는 예식
  const rw = s.weddings.find((x) => x.id === s.runWeddingId) || s.weddings[0];
  const setRwStatus = (v) => set({ weddings: s.weddings.map((x) => (x.id === rw.id ? { ...x, status: v } : x)) });

  const vals = {
    state: s, set,
    isRun: view === 'run', isAdmin: view === 'admin', isSchedule: view === 'schedule',
    navBtns: [['run', '오퍼레이터 (태블릿)'], ['admin', '관리자 (대표)']].map(([id, label]) => ({
      label,
      active: view === id || (id === 'run' && view === 'schedule'),
      go: () => set({ view: id }),
    })),
    goSchedule: () => set({ view: 'schedule' }),
    backToRun: () => set({ view: 'run' }),

    // ----- 실행 화면 -----
    rw,
    runContractChips: contractOrder.filter((k) => rw.contract[k]).map((k) => (k === '이벤트' ? '특별 이벤트' : k === '주례' ? '주례 있음' : '축가')),
    runStatus: statusMap[rw.status],
    showStartBtn: rw.status === 'upcoming',
    showEndBtn: rw.status === 'ongoing',
    showFeedback: rw.status === 'done',
    startWedding: () => setRwStatus('ongoing'),
    endWedding: () => setRwStatus('done'),
    showOffline: !!window.WC_CONFIG.showOfflineBanner,
    doneCount, totalCount: allItems.length,
    Spinner,

    runQuery, structureFb, fbSet, stepNames,

    // ----- 담당 예식 일정(오퍼레이터) -----
    opDate: s.opDate,
    setOpDate: (iso) => set({ opDate: iso }),
    opWeddings: s.weddings.filter((w) => w.dateIso === s.opDate),
    openRun: (id) => set({ view: 'run', runWeddingId: id }),

    // ----- 관리자 공용 -----
    adminTabs: [['template', '템플릿'], ['wedding', '예식'], ['member', '회원'], ['insight', '인사이트']],
    goNewWedding: () => set({ adminTab: 'wedding', detailId: null }),
    isTabTemplate: !s.detailId && s.adminTab === 'template',
    isTabWedding: !s.detailId && s.adminTab === 'wedding',
    isTabMember: !s.detailId && s.adminTab === 'member',
    isTabInsight: !s.detailId && s.adminTab === 'insight',
    isDetail: !!s.detailId,

    countFor: (contract) => countFor(s.templateSteps, contract),
    contractLabel,
    statusMap,
    contractOrder,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopSwitcher vals={vals} />
      {vals.isRun && <RunScreen vals={vals} />}
      {vals.isSchedule && <ScheduleScreen vals={vals} />}
      {vals.isAdmin && <AdminScreen vals={vals} />}
    </div>
  );
}

// 상단 "프로토타입 · 화면 전환" 바 — 실제 제품에는 없는, 데모 전용 내비게이션입니다.
function TopSwitcher({ vals }) {
  return (
    <div style={{ background: '#1f1f1f', color: '#fff', display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.2px' }}>
        웨딩체크 <span style={{ fontWeight: 400, color: '#bcbcbc', fontSize: 12, marginLeft: 4 }}>프로토타입 · 화면 전환</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        {vals.navBtns.map((nb) => (
          <button
            key={nb.label}
            onClick={nb.go}
            style={{ border: 'none', cursor: 'pointer', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: nb.active ? '#e8552d' : 'rgba(255,255,255,0.1)', color: '#fff' }}
          >
            {nb.label}
          </button>
        ))}
      </div>
    </div>
  );
}
