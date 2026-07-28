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

// drizzle-orm이 raw Postgres 에러를 감쌀 때 실제 코드는 err.cause.code에 있다
// (Story 5.4 코덱스 3차에서 node_modules/drizzle-orm/errors.js로 확인). 감싸지 않고
// 그대로 올라오는 경로도 있어 양쪽을 모두 본다.
function readPostgresCode(err: Error): string | null {
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (err as { cause?: { code?: unknown } }).cause;
  if (typeof cause?.code === "string") return cause.code;
  return null;
}

/**
 * 로그·DB에 남겨도 안전한 오류 라벨. **오류 메시지는 포함하지 않는다.**
 *
 * 오류를 기록하는 모든 지점(구조화 로그, `insight_recompute_state.last_error`)은
 * raw `err`나 `err.message` 대신 이 함수를 거쳐야 한다.
 */
export function toSafeErrorLabel(err: unknown): string {
  if (!(err instanceof Error)) return "UnknownError";
  const name = err.name && err.name.length > 0 ? err.name : "Error";
  const code = readPostgresCode(err);
  return code ? `${name}(${code})` : name;
}
