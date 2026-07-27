import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as templateItemRepo from "@/lib/db/repositories/template-item";

// scripts/seed-ceremony-checklist.ts가 재실행할 때마다 12단계를 STEPS 순서 그대로
// 재배치하기 위해 쓰는 저수준 함수(코덱스 리뷰 2차 P2 반영). 일반 admin CRUD 경로는
// 쓰지 않고, 대상 값이 UNIQUE 제약과 충돌하지 않음을 호출자가 보장해야 한다.
describe("templateItemRepo.setSortOrder", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("지정한 sortOrder로 갱신한다", async () => {
    const hall = await createTestHall();
    const item = await createTestTemplateItem(hall.id, { sortOrder: 3 });

    await templateItemRepo.setSortOrder(hall.id, item.id, 99);

    const updated = await templateItemRepo.findById(hall.id, item.id);
    expect(updated?.sortOrder).toBe(99);
  });

  it("다른 홀의 id로는 아무 것도 바뀌지 않는다 (홀 스코프 격리)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const item = await createTestTemplateItem(hallA.id, { sortOrder: 3 });

    await templateItemRepo.setSortOrder(hallB.id, item.id, 99);

    const unchanged = await templateItemRepo.findById(hallA.id, item.id);
    expect(unchanged?.sortOrder).toBe(3);
  });
});
