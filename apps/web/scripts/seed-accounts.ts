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

// AD-10: 시크릿 하드코딩 금지 — 관리자 초기 비밀번호/연락처는 .env.local의 환경변수로
// 주입한다. 값을 지정하지 않으면 로컬 개발용 기본값으로 대체된다.
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "changeme123!";
const ADMIN_PHONE_NUMBER = process.env.SEED_ADMIN_PHONE_NUMBER || "";
const OPERATOR_PASSWORD = process.env.SEED_OPERATOR_PASSWORD || "changeme123!";

async function seedAccount(
  email: string,
  password: string,
  name: string,
  role: Role,
  phoneNumber?: string,
) {
  const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (existing) {
    console.log(`이미 존재함, 건너뜀: ${email}`);
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
