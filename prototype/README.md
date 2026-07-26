# 웨딩체크 프로토타입 (파일 분리 버전)

Claude Design에서 만든 `웨딩체크 Prototype.dc.html`(Claude Design 전용 `dc-runtime` 포맷,
`support.js` 없이는 브라우저에서 단독 실행 불가)을, 빌드 도구 없이 브라우저에서 바로 도는
**순수 React(CDN) + Babel standalone** 구조로 이식하고 화면별 파일로 나눈 버전입니다.

## 실행 방법

빌드 없이 정적 파일이라, 로컬 서버 아무거나로 `index.html`을 서빙하면 됩니다.

```
npx serve prototype
# 또는
python -m http.server --directory prototype 8080
```

CDN(React/ReactDOM/Babel standalone/Pretendard 폰트)을 불러오므로 인터넷 연결이 필요합니다.

## 파일 구조

```
prototype/
  index.html            화면 셸 + 스크립트 로드 순서
  styles.css             전역 스타일(폰트, 리셋, 키프레임)
  js/
    data.js               초기 상태(시드 데이터) — 여기 배열만 고치면 시나리오 변경 가능
    helpers.js             statusMap/contractLabel 등 공용 헬퍼 + Btn/FocusInput(hover·focus 래퍼)
    App.js                 최상위 state 보관 + 화면 라우팅 + runQuery/structureFb 목업 로직
    main.js                #root에 App 마운트
    screens/
      RunScreen.js          실행 화면(신입, 태블릿) — UJ-1/UJ-2, FR-5~8
      ScheduleScreen.js      담당 예식 일정(오퍼레이터 캘린더)
      AdminScreen.js          관리자 셸(탭 + 새 예식 등록 CTA)
      TemplateScreen.js       체크리스트 템플릿 관리 — FR-1, FR-2
      WeddingScreen.js        예식 등록 + 목록 — FR-3, FR-4
      WeddingDetailScreen.js  예식 1건 전용 체크리스트 인스턴스 편집
      MemberScreen.js         회원(오퍼레이터/관리자) 관리
      InsightScreen.js        인사이트(읽기 전용) — FR-9, FR-10
```

각 화면 파일은 `App.js`가 계산한 `vals` 객체(원본 dc.html의 `renderVals()`와 동일한 역할)를
그대로 받아서 그리기만 합니다. 상태 자체는 `App.js` 한 곳에서만 바뀝니다.

## PRD 대비 차이점 요약

전체 내용은 대화창 답변 참고. 특히 아래 두 가지는 코드에도 주석으로 남겨뒀습니다.

- **`runQuery`(App.js)** — 지금은 키워드 포함 여부로 매칭하는 목업입니다. PRD FR-5/FR-6/FR-9는
  "의미 기반(semantic)" 매칭을 요구하므로, 실제 구현에서는 임베딩 기반 유사도 검색으로 교체해야 합니다.
- **`structureFb`(App.js)** — 정규식 기반 목업 구조화입니다. 실제 FR-8은 LLM 기반 자동 구조화를 요구합니다.

## 원본과 다른 점 (기술적으로만)

- `style-hover` / `style-focus` 커스텀 속성은 표준 React에 없으므로, `helpers.js`의
  `Btn` / `FocusInput` / `FocusTextarea` 래퍼 컴포넌트로 대체했습니다(마우스 진입/포커스 시
  스타일을 얹는 방식). 시각적 결과는 동일합니다.
- Claude Design 컨트롤 패널의 `startView` / `showOfflineBanner` 토글은 `js/data.js`의
  `window.WC_CONFIG` 상수로 대체했습니다. 코드에서 값만 바꾸면 됩니다.
