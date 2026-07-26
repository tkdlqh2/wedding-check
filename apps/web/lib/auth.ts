import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";

// AD-3: 역할은 정확히 2종 — "operator"(질의+피드백+체크리스트 열람) / "admin"(홀·템플릿·예식 CRUD+인사이트).
// "신입"/"선임" 같은 중간 티어는 시스템에 존재하지 않는다.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["operator", "admin"],
        // 새 계정은 기본적으로 낮은 권한(operator)으로 생성된다 — 최소 권한 원칙.
        // admin 승격은 scripts/seed-accounts.ts가 가입 직후 DB에서 직접 UPDATE한다.
        defaultValue: "operator",
        // 사용자가 회원가입 시 스스로 role을 지정하지 못하게 막는다 — 계정 프로비저닝은
        // scripts/seed-accounts.ts를 통해서만 이뤄진다(PRD에 셀프 가입 FR이 없음).
        input: false,
      },
    },
  },
});

export type Role = "operator" | "admin";
