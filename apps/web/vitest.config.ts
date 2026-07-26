import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const alias = { "@": path.resolve(__dirname, ".") };
const commonExclude = ["**/node_modules/**", "**/.next/**"];

export default defineConfig({
  test: {
    // 서버/DB 통합 테스트(.test.ts)는 node 환경, React 컴포넌트 테스트(.test.tsx)는 jsdom 환경.
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          globals: true,
          include: ["**/*.test.ts"],
          exclude: commonExclude,
          setupFiles: ["./vitest.setup.ts"],
          // DB 통합 테스트는 전부 같은 wedding_check_test DB를 공유하고
          // beforeEach에서 전체 테이블을 TRUNCATE한다 — 파일 간 병렬 실행 시
          // 서로의 데이터를 지우는 레이스가 나므로 순차 실행으로 고정한다.
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          globals: true,
          include: ["**/*.test.tsx"],
          exclude: commonExclude,
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
