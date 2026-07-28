// NFR-5: 피드백 원문·상황 세부는 로그에도 DB에도 남지 않아야 한다.
//
// 문제는 오류 **메시지**가 그 통로가 된다는 것이다(Story 4.1 코덱스 1차 P1):
//   - drizzle-orm은 실패한 쿼리를 DrizzleQueryError로 감싸면서 SQL과 **파라미터**를
//     함께 싣는다. feedback/variable_cases/insight_clusters 쓰기 경로의 파라미터에는
//     situation·rationale·라벨이 그대로 들어 있다.
//   - lib/ai/adapters/openai.ts는 벤더 오류 본문(`await res.text()`)을 메시지에 붙인다.
// 따라서 `err.message`나 raw `err`를 그대로 console에 넘기거나 컬럼에 저장하면
// 상황 설명이 로그·상태 행으로 새어나갈 수 있다.
//
// 여기서는 **메시지를 절대 포함하지 않는** 라벨만 만든다. 대신 진단에 실제로 쓸모
// 있는 두 가지 — 오류 종류와 Postgres SQLSTATE — 는 남긴다(예: "DrizzleQueryError(23505)").
// 원문 메시지가 필요한 디버깅은 벤더/DB 콘솔에서 해야 하며, 이 트레이드오프는
// 의도된 것이다(deferred-work.md 참고).

// `name`과 `code`는 둘 다 **오류를 만든 쪽이 자유롭게 지정할 수 있는 값**이다(코덱스
// 2차 P2). 벤더 SDK나 미래의 코드가 여기에 응답 본문을 담아버리면 "메시지만 막으면
// 된다"는 전제가 무너진다. 그래서 통과 조건을 형태로 못 박는다 — 이 함수의 계약이
// "메시지가 새지 않는다"인 이상, 계약을 지키는 책임을 호출자에게 넘기지 않는다.
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
// PostgreSQL SQLSTATE는 정확히 5자리 영숫자 대문자다.
const SQLSTATE = /^[0-9A-Z]{5}$/;

// drizzle-orm이 raw Postgres 에러를 감쌀 때 실제 코드는 err.cause.code에 있다
// (Story 5.4 코덱스 3차에서 node_modules/drizzle-orm/errors.js로 확인). 감싸지 않고
// 그대로 올라오는 경로도 있어 양쪽을 모두 본다.
function readPostgresCode(err: Error): string | null {
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === "string" && SQLSTATE.test(direct)) return direct;
  const cause = (err as { cause?: { code?: unknown } }).cause;
  if (typeof cause?.code === "string" && SQLSTATE.test(cause.code)) return cause.code;
  return null;
}

/**
 * 로그·DB에 남겨도 안전한 오류 라벨. **오류 메시지는 포함하지 않는다.**
 *
 * 오류를 기록하는 모든 지점(구조화 로그, `insight_recompute_state.last_error`)은
 * raw `err`나 `err.message` 대신 이 함수를 거쳐야 한다.
 *
 * 출력은 항상 `Name` 또는 `Name(SQLSTATE)` 형태이며, 그 형태를 만족하지 못하는 입력은
 * 통째로 `Error`/생략으로 떨어진다 — 진단 정보를 조금 잃더라도 유출 경로를 남기지 않는다.
 */
export function toSafeErrorLabel(err: unknown): string {
  if (!(err instanceof Error)) return "UnknownError";
  const name = SAFE_NAME.test(err.name) ? err.name : "Error";
  const code = readPostgresCode(err);
  return code ? `${name}(${code})` : name;
}
