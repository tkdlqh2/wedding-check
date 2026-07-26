import "@testing-library/jest-dom/vitest";
import { config as loadEnv } from "dotenv";
import path from "path";

// DB 통합 테스트는 wedding_check_test DB를 가리키는 .env.test를 사용한다(개발 DB와 분리).
loadEnv({ path: path.resolve(__dirname, ".env.test") });
