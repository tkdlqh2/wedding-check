// 웨딩체크 프로토타입 — 초기 상태(시드 데이터) + 화면 설정
// 실제 백엔드 연동 전까지는 이 파일의 배열을 고쳐서 시나리오를 바꿔볼 수 있습니다.
// 원본: Claude Design "웨딩체크 Prototype.dc.html" (dc-runtime 전용 포맷)을
//       순수 React(CDN)+Babel standalone 구조로 이식한 버전입니다.

// 컨트롤 패널에서 토글하던 두 값 — 여기서는 상수로 관리합니다.
window.WC_CONFIG = {
  startView: 'run', // 'run' | 'admin'
  showOfflineBanner: false,
};

window.WC_INITIAL_STATE = {
  view: null,
  adminTab: 'template',

  // ===== 실행 화면(오늘 예식) 체크리스트 =====
  steps: [
    { name: '식전 준비', expanded: false, items: [
      { id: 's1a', summary: '하객 입장 BGM 시작 (식전 30분)', done: true, detail: '플레이리스트 A를 볼륨 -12dB로 재생합니다. 하객이 몰리는 식전 10분부터는 -10dB까지 올려도 됩니다.', video: true, videoLen: '0:42', videoDesc: '콘솔에서 플레이리스트 A 큐 걸기' },
      { id: 's1b', summary: 'HDMI 셀렉터 1번 입력 확인', done: true, detail: '부스 좌측 셀렉터가 1번(식전 영상)인지 확인합니다. 2번으로 넘어가 있으면 스크린에 영상이 안 나옵니다 — 6월 실제 사고 사례.', video: false },
      { id: 's1c', summary: '마이크 1·2·3번 채널 사운드체크', done: true, detail: '사회자(1번), 주례(2번), 축가(3번) 순서로 체크. 하울링이 나면 해당 채널 게인을 먼저 내리고 EQ 2kHz를 -3dB.', video: true, videoLen: '1:15', videoDesc: '채널별 게인·EQ 기본 세팅' },
    ]},
    { name: '사회자 오프닝', expanded: false, items: [
      { id: 's2a', summary: '하우스 조명 50% 전환', done: true, detail: '오프닝 멘트 시작과 동시에 하우스 조명을 50%로 내립니다. 페이드 3초.', video: false },
      { id: 's2b', summary: '사회자 마이크 1번 채널 온', done: true, detail: null, video: false },
    ]},
    { name: '개식 선언 · 화촉 점화', expanded: false, items: [
      { id: 's3a', summary: '양가 어머니 스팟 조명', done: true, detail: '화촉대 좌·우 스팟 2기를 동시에 켭니다. 입장 동선을 따라 팔로우하지 않아도 됩니다 — 고정 스팟.', video: true, videoLen: '0:38', videoDesc: '화촉 스팟 위치와 큐 타이밍' },
      { id: 's3b', summary: 'BGM 페이드아웃 (3초)', done: false, detail: null, video: false },
    ]},
    { name: '신랑 입장', expanded: true, items: [
      { id: 's4a', summary: '입구 스팟 + 입장 BGM 큐', done: false, detail: '사회자 소개 멘트 "신랑 입장!" 직후에 BGM과 스팟을 동시에 겁니다. BGM 전주가 짧으니 미리 페이더를 올려두세요.', video: true, videoLen: '0:55', videoDesc: '신랑 입장 큐 동시 실행' },
      { id: 's4b', summary: '무빙라이트 팔로우', done: false, detail: '입구에서 단상까지 무빙 1기로 팔로우. 속도 프리셋 2번을 사용하면 걸음 속도와 맞습니다.', video: true, videoLen: '1:02', videoDesc: '무빙라이트 프리셋 2번 팔로우' },
    ]},
    { name: '신부 입장', expanded: false, items: [
      { id: 's5a', summary: '메인 조명 전환 · 버진로드 100%', done: false, detail: '입장 BGM 전주 8초가 조명 전환 버퍼입니다. 곡이 시작되면 늦은 게 아니라, 전주 안에만 전환하면 됩니다.', video: true, videoLen: '1:20', videoDesc: '버진로드 조명 전환 타이밍' },
    ]},
    { name: '주례사', expanded: false, items: [
      { id: 's6a', summary: '주례 마이크 2번 채널 온', done: false, detail: null, video: false },
      { id: 's6b', summary: '단상 집중 조명 전환', done: false, detail: '주례가 즉흥으로 순서를 바꾸면 조명 전환은 보류하고 현재 상태 유지. 마이크는 "지금 말하는 사람" 기준.', video: true, videoLen: '0:48', videoDesc: '단상 집중 조명 큐' },
    ]},
    { name: '축가', expanded: false, items: [
      { id: 's7a', summary: 'MR 큐 30초 전 대기', done: false, detail: '사회자 소개 멘트가 시작될 때 MR을 미리 걸어둡니다. 페이더는 올려두고 재생 버튼만 남겨두세요 — 반주 지연 사고가 가장 잦은 지점입니다.', video: true, videoLen: '1:08', videoDesc: 'MR 사전 큐 걸기' },
      { id: 's7b', summary: '축가자 마이크 3번 채널 온', done: false, detail: null, video: false },
    ]},
    { name: '성혼 선언문 낭독', expanded: false, items: [
      { id: 's8a', summary: '사회자 마이크 복귀 · 전체 조명 70%', done: false, detail: null, video: false },
    ]},
    { name: '행진', expanded: false, items: [
      { id: 's9a', summary: '전체 조명 100% + 행진 BGM', done: false, detail: '행진 선언과 동시에 실행. BGM은 후렴부터 시작하는 편집본(트랙 12)을 사용합니다.', video: true, videoLen: '0:50', videoDesc: '행진 큐 동시 실행' },
      { id: 's9b', summary: '축포 큐 (버진로드 중간 지점)', done: false, detail: '신랑신부가 버진로드 중간을 지날 때 축포. 너무 이르면 사진이 안 나옵니다 — 포토 기준점은 3번째 샹들리에 아래.', video: true, videoLen: '0:35', videoDesc: '축포 타이밍 기준점' },
    ]},
    { name: '원판 촬영 안내', expanded: false, items: [
      { id: 's10a', summary: '하우스 조명 복원 · 안내 멘트 BGM 소폭', done: false, detail: null, video: false },
    ]},
  ],

  detailOpen: null,

  // ===== 실행 중 자연어 질의 =====
  queryText: '', queryLoading: false, queryResult: null,

  // ===== 예식 후 피드백 =====
  fbText: '', fbStep: '', fbLoading: false, fbPreview: null, fbSaved: false, fbDraftSaved: false,

  // ===== 관리자 · 체크리스트 템플릿 =====
  templateSteps: [
    { id: 't1', name: '식전 준비', condition: null, newItem: '', items: [
      { id: 't1a', summary: '하객 입장 BGM 시작 (식전 30분)', detail: true, video: true },
      { id: 't1b', summary: 'HDMI 셀렉터 1번 입력 확인', detail: true, video: false },
      { id: 't1c', summary: '마이크 1·2·3번 채널 사운드체크', detail: true, video: true },
    ]},
    { id: 't2', name: '사회자 오프닝', condition: null, newItem: '', items: [
      { id: 't2a', summary: '하우스 조명 50% 전환', detail: true, video: false },
      { id: 't2b', summary: '사회자 마이크 1번 채널 온', detail: false, video: false },
    ]},
    { id: 't3', name: '개식 선언 · 화촉 점화', condition: null, newItem: '', items: [
      { id: 't3a', summary: '양가 어머니 스팟 조명', detail: true, video: true },
      { id: 't3b', summary: 'BGM 페이드아웃 (3초)', detail: false, video: false },
    ]},
    { id: 't4', name: '신랑 입장', condition: null, newItem: '', items: [
      { id: 't4a', summary: '입구 스팟 + 입장 BGM 큐', detail: true, video: true },
      { id: 't4b', summary: '무빙라이트 팔로우', detail: true, video: true },
    ]},
    { id: 't5', name: '신부 입장', condition: null, newItem: '', items: [
      { id: 't5a', summary: '메인 조명 전환 · 버진로드 100%', detail: true, video: true },
    ]},
    { id: 't6', name: '주례사', condition: '주례', newItem: '', items: [
      { id: 't6a', summary: '주례 마이크 2번 채널 온', detail: false, video: false },
      { id: 't6b', summary: '단상 집중 조명 전환', detail: true, video: true },
    ]},
    { id: 't7', name: '축가', condition: '축가', newItem: '', items: [
      { id: 't7a', summary: 'MR 큐 30초 전 대기', detail: true, video: true },
      { id: 't7b', summary: '축가자 마이크 3번 채널 온', detail: false, video: false },
    ]},
    { id: 't8', name: '성혼 선언문 낭독', condition: null, newItem: '', items: [
      { id: 't8a', summary: '사회자 마이크 복귀 · 전체 조명 70%', detail: false, video: false },
    ]},
    { id: 't9', name: '특별 이벤트 (부케토스 등)', condition: '이벤트', newItem: '', items: [
      { id: 't9a', summary: '이벤트별 조명·음향 큐시트 확인', detail: true, video: true },
    ]},
    { id: 't10', name: '행진', condition: null, newItem: '', items: [
      { id: 't10a', summary: '전체 조명 100% + 행진 BGM', detail: true, video: true },
      { id: 't10b', summary: '축포 큐 (버진로드 중간 지점)', detail: true, video: true },
    ]},
    { id: 't11', name: '원판 촬영 안내', condition: null, newItem: '', items: [
      { id: 't11a', summary: '하우스 조명 복원 · 안내 멘트 BGM 소폭', detail: false, video: false },
    ]},
  ],
  newStepName: '',

  // ===== 예식(인스턴스) =====
  weddings: [
    { id: 'w1', time: '11:30', couple: '정우성 · 한소희', date: '7월 25일 (토)', dateIso: '2026-07-25', hall: '가든홀', assignees: ['박세영'], contract: { 주례: false, 축가: true, 이벤트: true }, status: 'done', progress: '10 / 10 완료' },
    { id: 'w2', time: '14:00', couple: '김민준 · 이서현', date: '7월 25일 (토)', dateIso: '2026-07-25', hall: '그랜드홀', assignees: ['김도윤', '이준서'], contract: { 주례: true, 축가: true, 이벤트: false }, status: 'ongoing', progress: '3 / 10 진행' },
    { id: 'w3', time: '16:30', couple: '박준호 · 최지우', date: '7월 25일 (토)', dateIso: '2026-07-25', hall: '그랜드홀', assignees: [], contract: { 주례: true, 축가: false, 이벤트: true }, status: 'upcoming', progress: '시작 전' },
    { id: 'w4', time: '13:00', couple: '서지훈 · 김유나', date: '8월 1일 (토)', dateIso: '2026-08-01', hall: '컨벤션홀', assignees: ['김도윤'], contract: { 주례: false, 축가: true, 이벤트: false }, status: 'upcoming', progress: '시작 전' },
  ],
  runWeddingId: 'w2',

  // ===== 회원(오퍼레이터/관리자) =====
  members: [
    { id: 'm1', name: '김도윤', phone: '010-3421-7788', role: '오퍼레이터', since: '2023년 3월 입사', active: true },
    { id: 'm2', name: '박세영', phone: '010-9182-3345', role: '오퍼레이터', since: '2024년 1월 입사', active: true },
    { id: 'm3', name: '이준서', phone: '010-5567-2210', role: '오퍼레이터', since: '2026년 6월 입사', active: true },
    { id: 'm4', name: '한정민', phone: '010-1102-8876', role: '관리자', since: '2021년 5월 입사 · 대표', active: true },
    { id: 'm5', name: '정민재', phone: '010-2234-9911', role: '오퍼레이터', since: '2022년 9월 입사 · 2026년 5월 퇴사', active: false },
  ],
  nmName: '', nmPhone: '', nmRole: '오퍼레이터', nmError: false, showInactive: true,

  // ===== 새 예식 등록 폼 =====
  nwDate: '2026-08-01', nwTime: '13:00', nwCouple: '', nwHall: '그랜드홀',
  nwContract: { 주례: true, 축가: true, 이벤트: false }, nwError: false,

  // ===== 달력/필터 공용 =====
  calYear: 2026, calMonth: 7, filterDate: null, detailId: null, dwNewStep: '', opDate: '2026-07-25',

  // ===== 인사이트(관리자 전용, 읽기 전용) =====
  insights: [
    { title: '축가 반주(MR) 큐 지연', sub: '축가 단계 · 표현이 달라도 같은 원인으로 집계됨', count: 6, expanded: false, feedbacks: [
      { text: '축가 반주가 늦게 나와서 축가자가 어색하게 서 있었음. MR은 사회자 소개 멘트 시작할 때 미리 걸어놔야 함', meta: '6월 14일 · 김도윤 선임 · 축가' },
      { text: '반주 틀었는데 소리가 한 박자 늦게 올라옴. 페이더를 미리 올려두고 큐만 누르면 됨', meta: '6월 28일 · 김도윤 선임 · 축가' },
      { text: 'MR 준비가 안 된 상태에서 축가자가 마이크를 잡음. 30초 전 대기 습관화 필요', meta: '7월 5일 · 박세영 선임 · 축가' },
    ]},
    { title: '주례·사회자 즉흥 순서 변경', sub: '주례사 단계 · "목사님 애드리브" · "순서 바꿈" 동일 집계', count: 5, expanded: false, feedbacks: [
      { text: '주례자가 성혼 선언을 축가 앞으로 당김. 큐시트 순서 무시하고 지금 말하는 사람 기준으로 따라가면 됨', meta: '6월 7일 · 김도윤 선임 · 주례사' },
      { text: '목사님이 애드리브로 기도를 추가함. 마이크만 유지하고 조명 전환은 보류하는 게 맞았음', meta: '7월 12일 · 박세영 선임 · 주례사' },
    ]},
    { title: '식전 영상 송출 신호 끊김', sub: '식전 준비 단계 · HDMI 신호 관련', count: 3, expanded: false, feedbacks: [
      { text: '식전 영상이 스크린에 안 나옴. HDMI 셀렉터가 2번 입력으로 넘어가 있었음. 식전 점검 목록에 셀렉터 확인 추가 필요', meta: '6월 21일 · 김도윤 선임 · 식전 준비' },
    ]},
  ],

  // ===== 실행 중 질의가 검색하는 변수 케이스 원장 =====
  // 주의: 여기서는 키워드 포함 여부로 매칭하는 목업 로직입니다.
  // PRD FR-5/FR-6/FR-9는 "의미 기반(semantic)" 매칭을 요구합니다 — 실제 구현에서는
  // 임베딩/벡터 검색 등으로 교체해야 하며, 이 키워드 매칭은 클릭스루 데모용입니다.
  cases: [
    { kw: ['주례', '순서', '바꿈', '바꿨', '애드리브', '목사', '즉흥', '선언'], sim: 92, result: '잘 대처됨',
      situation: '주례자가 사전 협의 없이 성혼 선언을 축가 앞으로 당겼다. 오퍼레이터가 큐시트만 보다가 잠시 멈칫했지만, 사회자 진행을 따라가 마이크·조명을 전환했다.',
      judgment: '순서가 바뀌어도 마이크와 조명은 "지금 말하는 사람" 기준으로 따라가세요. 큐시트 순서는 무시하고 사회자와 눈을 맞추면 됩니다.', meta: '6월 7일 · 주례사 단계' },
    { kw: ['주례', '순서', '애드리브', '기도', '목사'], sim: 84, result: '잘못 대처됨',
      situation: '목사님이 애드리브로 기도를 추가했는데, 오퍼레이터가 다음 순서인 축가 조명으로 미리 전환해버려 단상이 어두워졌다.',
      judgment: '즉흥 순서가 시작되면 조명 전환은 보류하고 현재 상태를 유지하세요. 다음 큐는 사회자 멘트가 나온 뒤에 잡아도 늦지 않습니다.', meta: '7월 12일 · 주례사 단계' },
    { kw: ['축가', '반주', 'MR', '음향', '늦', '노래'], sim: 91, result: '잘못 대처됨',
      situation: '축가 순서에서 반주가 늦게 나왔고, 오퍼레이터가 당황해서 음향을 늦게 올렸다. 축가자가 무대에서 10초 이상 대기했다.',
      judgment: 'MR은 축가자가 마이크를 잡는 순간이 아니라, 사회자 소개 멘트가 시작될 때 미리 큐를 걸어두세요. 페이더는 올려두고 재생만 누르면 됩니다.', meta: '6월 14일 · 축가 단계' },
    { kw: ['조명', '입장', '신부', '큐', '어두', '놓치'], sim: 88, result: '잘 대처됨',
      situation: '신부 입장 직전 버진로드 조명 큐를 놓칠 뻔했으나, 입장 BGM 전주 8초를 버퍼로 활용해 전환을 맞췄다.',
      judgment: '입장 BGM의 전주 구간이 조명 전환의 버퍼입니다. 곡이 시작되면 늦은 게 아니라, 전주 안에만 전환하면 됩니다.', meta: '5월 30일 · 신부 입장 단계' },
    { kw: ['영상', '송출', '화면', '스크린', 'HDMI', '안나', '신호'], sim: 86, result: '잘못 대처됨',
      situation: '식전 영상이 스크린에 나오지 않았다. 원인은 HDMI 셀렉터가 2번 입력으로 넘어가 있던 것.',
      judgment: '화면이 안 나오면 케이블보다 셀렉터 입력 번호를 먼저 확인하세요. 부스 좌측 셀렉터는 1번이 식전 영상입니다.', meta: '6월 21일 · 식전 준비 단계' },
  ],
};
