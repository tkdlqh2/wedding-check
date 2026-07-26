// 공용 헬퍼 + 작은 재사용 컴포넌트
// DESIGN.md 기준 색/상태 매핑과, style-hover/style-focus 를 대체하는 Btn/FocusInput/FocusTextarea 래퍼.

window.WC = window.WC || {};

// 예식/체크리스트 상태 배지 매핑: [보더/포인트색, 라벨, 배지배경, 배지글자색]
window.WC.statusMap = {
  done: ['#1fa463', '완료', '#1fa463', '#fff'],
  ongoing: ['#f5a623', '진행중', '#f5a623', '#1f1f1f'],
  upcoming: ['#d4d4d4', '예정', '#f7f7f7', '#555'],
};

window.WC.contractOrder = ['주례', '축가', '이벤트'];

window.WC.contractLabel = (contract) =>
  window.WC.contractOrder
    .filter((k) => contract[k])
    .map((k) => (k === '이벤트' ? '특별 이벤트' : k === '주례' ? '주례 있음' : '축가'))
    .join(' · ') || '기본 구성';

// 계약 형태(contract)에 맞는 템플릿 항목 총 개수 계산 — FR-4 자동 조합 규칙
window.WC.countFor = (templateSteps, contract) =>
  templateSteps
    .filter((tp) => !tp.condition || contract[tp.condition])
    .reduce((n, tp) => n + tp.items.length, 0);

// 로딩 스피너 (버튼 안에 넣는 작은 원형 스피너)
window.WC.Spinner = function Spinner({ dark = true }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 9999,
        border: '2px solid ' + (dark ? 'rgba(255,255,255,0.35)' : '#e6e6e6'),
        borderTopColor: dark ? '#fff' : '#888',
        animation: 'wcspin 0.7s linear infinite',
        display: 'inline-block',
      }}
    />
  );
};

// 원본 프로토타입의 style-hover 를 대체하는 래퍼. base 스타일에 hover 시 hoverStyle을 얹습니다.
window.WC.Btn = function Btn({ as = 'button', style, hoverStyle, children, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const merged = hover && hoverStyle ? { ...style, ...hoverStyle } : style;
  return React.createElement(
    as,
    { ...rest, style: merged, onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) },
    children
  );
};

// style-focus 를 대체하는 input 래퍼 (focus 시 border 색 등 변경)
window.WC.FocusInput = function FocusInput({ style, focusStyle, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  const merged = focused && focusStyle ? { ...style, ...focusStyle } : style;
  return (
    <input
      {...rest}
      style={merged}
      onFocus={(e) => { setFocused(true); rest.onFocus && rest.onFocus(e); }}
      onBlur={(e) => { setFocused(false); rest.onBlur && rest.onBlur(e); }}
    />
  );
};

window.WC.FocusTextarea = function FocusTextarea({ style, focusStyle, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  const merged = focused && focusStyle ? { ...style, ...focusStyle } : style;
  return (
    <textarea
      {...rest}
      style={merged}
      onFocus={(e) => { setFocused(true); rest.onFocus && rest.onFocus(e); }}
      onBlur={(e) => { setFocused(false); rest.onBlur && rest.onBlur(e); }}
    />
  );
};

// 기본 focus 스타일(오렌지-레드 보더) — DESIGN.md §4 Inputs
// border는 항상 shorthand(1px solid ...)로 통일합니다 — longhand(borderColor)와 섞으면
// React가 style diff 시 "conflicting property" 경고를 냅니다.
window.WC.FOCUS_ORANGE = { border: '1px solid #e8552d' };
