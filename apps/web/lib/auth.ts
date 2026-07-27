import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { phoneNumber, admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";
import { db } from "./db";

// Story 5.4: admin 플러그인의 role 타입(및 auth.api.createUser 등의 body.role 타입)이
// 이 accessControl 설정에서 추론된다. 커스텀 roles를 안 주면 better-auth 기본 role 키가
// "admin"/"user"라 이 프로젝트의 "operator" 문자열이 TS 타입에 아예 존재하지 않게 된다
// (tsc가 실제로 이 불일치를 잡아냈다 — 우연히 문자열이 맞아떨어지는 것에 기대지 않고
// 명시적으로 "operator"/"admin" 두 역할을 등록한다).
const ac = createAccessControl(defaultStatements);
const operatorRole = ac.newRole({ user: [], session: [] });

// AD-3: 역할은 정확히 2종 — "operator"(질의+피드백+체크리스트 열람) / "admin"(홀·템플릿·예식 CRUD+인사이트).
// "신입"/"선임" 같은 중간 티어는 시스템에 존재하지 않는다.
//
// 로그인 식별자는 이메일이 아니라 전화번호다 — 오퍼레이터/관리자 계정을 일일이 이메일로
// 받지 않기로 결정(2026-07-26). better-auth 코어는 email 컬럼을 구조적으로 요구하므로
// scripts/seed-accounts.ts가 내부적으로만 쓰는 합성 placeholder 값을 채운다(UI에 노출/
// 수집하지 않음). 로그인은 phone-number 플러그인의 signIn.phoneNumber(전화번호+비밀번호)만
// 사용하고 SMS OTP는 쓰지 않는다(SMS 발송 업체 연동 없음, 2026-07-26 결정).
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    // signUpEmail(계정 프로비저닝, scripts/seed-accounts.ts 전용)에는 여전히 필요하지만,
    // 사용자 대상 이메일 로그인 경로(/sign-in/email)는 아래 훅으로 차단한다 — 그대로 열어두면
    // 합성 placeholder 이메일 + 비밀번호로 전화번호 정책을 우회해 로그인할 수 있다
    // (코덱스 리뷰 P1 반영).
    enabled: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        throw new APIError("BAD_REQUEST", {
          message: "이메일 로그인은 지원하지 않습니다. 전화번호로 로그인하세요.",
        });
      }
    }),
  },
  // Story 5.4: 공식 admin 플러그인. 세션 생성(로그인) 시 user.banned를 자동 확인해 차단하는
  // 훅(databaseHooks.session.create.before)과 auth.api.createUser/banUser/unbanUser를
  // 그대로 제공한다 — 직접 재구현하지 않는다(스토리 Dev Notes에 근거 상세).
  // defaultRole을 명시하지 않으면 이 플러그인의 신규 유저 role 폴백이 better-auth 기본값인
  // "user"가 되어 이 프로젝트의 실제 기본 역할(operator)과 어긋난다.
  // roles에 operator를 명시적으로 등록한다 — "admin" 역할 문자열이 better-auth 기본 admin
  // 권한 세트와 우연히 같다고 기대지 않고, 이 시스템의 실제 두 역할(operator: 권한 없음,
  // admin: adminAc 전체 권한)을 그대로 매핑한다.
  plugins: [
    phoneNumber(),
    admin({
      ac,
      roles: { admin: adminAc, operator: operatorRole },
      defaultRole: "operator",
      bannedUserMessage: "비활성화된 계정입니다. 관리자에게 문의하세요.",
    }),
  ],
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
