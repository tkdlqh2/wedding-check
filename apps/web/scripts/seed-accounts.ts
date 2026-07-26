/**
 * 초기 계정 시드 스크립트.
 *
 * PRD의 FR-1~11 어디에도 "계정 생성" 기능이 없다(내부 교육 도구라 셀프 가입 UI가
 * v1 스코프 밖으로 보임, [ASSUMPTION] — 대표 확인 필요). 그래서 v1의 유일한 계정
 * 프로비저닝 경로는 이 스크립트다: 관리자 1명 + 오퍼레이터 1명을 생성한다.
 *
 * role은 better-auth의 emailAndPassword 가입 API로는 설정할 수 없다
 * (lib/auth.ts에서 `input: false`로 막아뒀다 — 사용자가 스스로 role을 지정하지 못하게).
 * 그래서 가입 후 Drizzle로 직접 UPDATE한다.
 *
 * 실행: npm run seed (package.json의 seed 스크립트가 --env-file=.env.local로 실행한다)
 */
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "../lib/auth";

// AD-10: 시크릿 하드코딩 금지 — 관리자/오퍼레이터 초기 비밀번호는 .env.local의 환경변수로만
// 주입한다. 미지정 시 알려진 기본 비밀번호로 조용히 대체하면 그 자체로 보안 사고이므로,
// 값이 없으면 즉시 에러로 중단한다(코덱스 리뷰 P1 반영).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} 환경변수가 필요합니다 — 알려진 기본 비밀번호로 계정이 생성되는 것을 막기 위해 필수입니다. .env.local에 값을 설정하세요.`,
    );
  }
  return value;
}

const ADMIN_PASSWORD = requireEnv("SEED_ADMIN_PASSWORD");
const OPERATOR_PASSWORD = requireEnv("SEED_OPERATOR_PASSWORD");
const ADMIN_PHONE_NUMBER = process.env.SEED_ADMIN_PHONE_NUMBER || "";

async function seedAccount(
  email: string,
  password: string,
  name: string,
  role: Role,
  phoneNumber?: string,
) {
  const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (existing) {
    // 이미 시드된 계정이라도 role/phoneNumber는 최신 환경변수 값으로 갱신한다(코덱스 리뷰 P2 반영)
    // — 그렇지 않으면 SEED_ADMIN_PHONE_NUMBER를 나중에 설정해도 기존 계정에 절대 반영되지 않는다.
    await db
      .update(user)
      .set({ role, ...(phoneNumber ? { phoneNumber } : {}) })
      .where(eq(user.email, email));
    console.log(`이미 존재함, role/phoneNumber 갱신: ${email}`);
    return;
  }

  await auth.api.signUpEmail({
    body: { email, password, name, ...(phoneNumber ? { phoneNumber } : {}) },
  });

  await db.update(user).set({ role }).where(eq(user.email, email));
  console.log(`생성됨: ${email} (role=${role})`);
}

async function main() {
  await seedAccount(
    "admin@wedding-check.local",
    ADMIN_PASSWORD,
    "관리자",
    "admin",
    ADMIN_PHONE_NUMBER,
  );
  await seedAccount("operator@wedding-check.local", OPERATOR_PASSWORD, "오퍼레이터", "operator");
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
