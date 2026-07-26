import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Neon의 서버리스 HTTP 드라이버는 로컬 Postgres(Docker 등)에 직접 접속할 수 없다.
// DATABASE_URL이 localhost/127.0.0.1을 가리키면 로컬 개발용 node-postgres로 접속하고,
// 그 외(Neon 실제 엔드포인트, 프로덕션/프리뷰)는 원래 드라이버를 그대로 쓴다.
const isLocalPostgres = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)/.test(
  process.env.DATABASE_URL,
);

export const db = isLocalPostgres
  ? drizzleNodePostgres(process.env.DATABASE_URL, { schema })
  : drizzleNeon(process.env.DATABASE_URL, { schema });
