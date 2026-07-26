/**
 * 초기 계정 시드 스크립트.
 *
 * PRD의 FR-1~11 어디에도 "계정 생성" 기능이 없다(내부 교육 도구라 셀프 가입 UI가
 * v1 스코프 밖으로 보임, [ASSUMPTION] — 대표 확인 필요). 그래서 v1의 유일한 계정
 * 프로비저닝 경로는 이 스크립트다: 관리자 1명 + 오퍼레이터 1명을 생성한다.
 *
 * 로그인 식별자는 전화번호다(이메일 아님, 2026-07-26 결정 — 계정마다 이메일을 일일이
 * 받지 않는다). better-auth 코어가 email 컬럼을 구조적으로 요구하므로, 이 스크립트가
 * 관리하는 "시드 슬롯"을 가리키는 고정 placeholder 이메일을 내부적으로만 채운다(UI에
 * 노출/수집하지 않음, 실제 로그인에도 쓰이지 않음 — lib/auth.ts가 /sign-in/email을 차단).
 *
 * role은 better-auth의 가입 API로는 설정할 수 없다(lib/auth.ts에서 `input: false`로
 * 막아뒀다 — 사용자가 스스로 role을 지정하지 못하게). 그래서 가입 후 Drizzle로 직접 UPDATE한다.
 *
 * 실행: npm run seed (package.json의 seed 스크립트가 --env-file=.env.local로 실행한다)
 */
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user, account } from "../lib/db/schema";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import type { Role } from "../lib/auth";

// AD-10: 시크릿 하드코딩 금지 — 관리자/오퍼레이터 초기 비밀번호는 .env.local의 환경변수로만
// 주입한다. 미지정 시 알려진 기본 비밀번호로 조용히 대체하면 그 자체로 보안 사고이므로,
// 값이 없으면 즉시 에러로 중단한다(코덱스 리뷰 P1 반영).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} 환경변수가 필요합니다. .env.local에 값을 설정하세요.`,
    );
  }
  return value;
}

const ADMIN_PASSWORD = requireEnv("SEED_ADMIN_PASSWORD");
const OPERATOR_PASSWORD = requireEnv("SEED_OPERATOR_PASSWORD");
// 전화번호가 로그인 식별자이므로 비밀번호와 마찬가지로 필수다.
const ADMIN_PHONE_NUMBER = requireEnv("SEED_ADMIN_PHONE_NUMBER");
const OPERATOR_PHONE_NUMBER = requireEnv("SEED_OPERATOR_PHONE_NUMBER");

async function seedAccount(
  seedEmail: string,
  phoneNumber: string,
  password: string,
  name: string,
  role: Role,
) {
  // 고정된 시드 슬롯 이메일(seedEmail)로 조회한다 — role이나 phoneNumber가 아니다.
  // role은 unique 제약이 없어 동일 역할 사용자가 여럿이면 findFirst가 임의의 계정(실제
  // 사용자일 수 있음)을 반환해 그 자격 증명을 덮어쓸 위험이 있고(코덱스 리뷰 3차 P1),
  // phoneNumber로 조회하면 번호 로테이션 시 기존 계정을 못 찾아 중복이 생긴다(코덱스
  // 리뷰 2차 P1). unique 제약이 있는 고정 이메일만이 "이 스크립트가 관리하는 시드
  // 계정"을 안전하게 식별한다 — 실제 로그인에는 쓰이지 않는다(email 로그인은 차단됨).
  const existing = await db.query.user.findFirst({ where: eq(user.email, seedEmail) });
  if (existing) {
    // 이미 시드된 계정이라도 phoneNumber/비밀번호를 최신 환경변수 값으로 갱신한다
    // — 그렇지 않으면 값을 나중에 바꿔도 기존 계정에는 절대 반영되지 않고, 특히
    // 이전에 알려진 기본 비밀번호로 생성된 계정이 그대로 남는다.
    await db.update(user).set({ role, phoneNumber }).where(eq(user.id, existing.id));
    await db
      .update(account)
      .set({ password: await hashPassword(password) })
      .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")));
    console.log(`이미 존재함, phoneNumber/비밀번호 갱신: ${phoneNumber} (role=${role})`);
    return;
  }

  await auth.api.signUpEmail({ body: { email: seedEmail, password, name } });

  // phoneNumberVerified: 관리자가 직접 프로비저닝한 계정이므로 SMS OTP 없이 신뢰한다
  // (2026-07-26 결정 — SMS 발송 업체 연동 없음).
  await db
    .update(user)
    .set({ role, phoneNumber, phoneNumberVerified: true })
    .where(eq(user.email, seedEmail));
  console.log(`생성됨: ${phoneNumber} (role=${role})`);
}

async function main() {
  await seedAccount(
    "seed-admin@wedding-check.internal",
    ADMIN_PHONE_NUMBER,
    ADMIN_PASSWORD,
    "관리자",
    "admin",
  );
  await seedAccount(
    "seed-operator@wedding-check.internal",
    OPERATOR_PHONE_NUMBER,
    OPERATOR_PASSWORD,
    "오퍼레이터",
    "operator",
  );
}

main()
  .then(() => {
    console.log("시드 완료");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
