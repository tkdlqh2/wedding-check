// drizzle-kit migrate가 이 프로젝트 로컬 환경에서 무한 대기/무출력 실패하는 문제(원인 미규명,
// Epic 1 회고 기록됨)를 우회하기 위한 스크립트. 빈 DB(테스트 DB, CI DB)에 drizzle/*.sql
// 마이그레이션 파일을 순서대로 그대로 실행한다. 이미 일부 적용된 DB에 대한 증분 적용은
// 지원하지 않는다 — 항상 빈 DB를 대상으로 한다.
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { Client } from "pg";

async function main() {
  const databaseUrl = process.argv[2] ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("사용법: tsx scripts/apply-migrations.ts <DATABASE_URL>");
    process.exit(1);
  }

  const drizzleDir = path.join(process.cwd(), "drizzle");
  const files = readdirSync(drizzleDir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const file of files) {
      const sql = readFileSync(path.join(drizzleDir, file), "utf-8").replaceAll(
        "--> statement-breakpoint",
        "",
      );
      console.log(`적용 중: ${file}`);
      await client.query(sql);
    }
    console.log(`완료 — ${files.length}개 마이그레이션 적용됨`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
