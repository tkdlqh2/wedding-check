/**
 * 초기 계정 시드 스크립트.
 *
 * PRD의 FR-1~11 어디에도 "계정 생성" 기능이 없다(내부 교육 도구라 셀프 가입 UI가
 * v1 스코프 밖으로 보임, [ASSUMPTION] — 대표 확인 필요). 그래서 v1의 유일한 계정
 * 프로비저닝 경로는 이 스크립트다: 관리자 1명 + 오퍼레이터 1명을 생성한다.
 *
 * 로그인 식별자는 전화번호다(이메일 아님, 2026-07-26 결정 — 계정마다 이메일을 일일이
 * 받지 않는다). better-auth 코어가 email 컬럼을 구조적으로 요구하므로, 전화번호에서
 * 파생한 합성 placeholder 이메일을 내부적으로만 채운다(UI에 노출/수집하지 않음).
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

// better-auth 코어의 email 컬럼(NOT NULL + unique)을 채우기 위한 내부용 합성 값 —
// 실제 이메일이 아니며 UI에 노출되거나 수집되지 않는다. 전화번호에서 결정적으로
// 파생시켜 재시드 시에도 동일 계정을 가리키게 한다.
function syntheticEmail(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  return `${digits}@seed.wedding-check.internal`;
}

async function seedAccount(phoneNumber: string, password: string, name: string, role: Role) {
  const existing = await db.query.user.findFirst({ where: eq(user.phoneNumber, phoneNumber) });
  if (existing) {
    // 이미 시드된 계정이라도 role/비밀번호를 최신 환경변수 값으로 갱신한다(코덱스 리뷰
    // P1/P2 반영) — 그렇지 않으면 값을 나중에 바꿔도 기존 계정에는 절대 반영되지 않고,
    // 특히 이전에 알려진 기본 비밀번호로 생성된 계정이 그대로 남는다.
    await db.update(user).set({ role }).where(eq(user.phoneNumber, phoneNumber));
    await db
      .update(account)
      .set({ password: await hashPassword(password) })
      .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")));
    console.log(`이미 존재함, role/비밀번호 갱신: ${phoneNumber}`);
    return;
  }

  const email = syntheticEmail(phoneNumber);
  await auth.api.signUpEmail({ body: { email, password, name } });

  // phoneNumberVerified: 관리자가 직접 프로비저닝한 계정이므로 SMS OTP 없이 신뢰한다
  // (2026-07-26 결정 — SMS 발송 업체 연동 없음).
  await db
    .update(user)
    .set({ role, phoneNumber, phoneNumberVerified: true })
    .where(eq(user.email, email));
  console.log(`생성됨: ${phoneNumber} (role=${role})`);
}

async function main() {
  await seedAccount(ADMIN_PHONE_NUMBER, ADMIN_PASSWORD, "관리자", "admin");
  await seedAccount(OPERATOR_PHONE_NUMBER, OPERATOR_PASSWORD, "오퍼레이터", "operator");
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
