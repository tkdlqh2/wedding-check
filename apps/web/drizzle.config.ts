import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// dotenv/config 기본 로더는 .env만 읽는다 — 이 프로젝트는 .env.local만 사용하므로 명시 지정한다.
config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
