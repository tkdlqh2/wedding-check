import { eq, desc } from "drizzle-orm";
import { db } from "../index";
import { user } from "../schema";

export type Member = typeof user.$inferSelect;

// user는 halls와 마찬가지로 홀 종속 엔티티가 아니라 루트 엔티티이므로 AD-2의 hallId
// 필수 첫 인자 규칙은 이 리포지토리에는 적용되지 않는다.
export async function findAll(): Promise<Member[]> {
  return db.query.user.findMany({ orderBy: desc(user.createdAt) });
}

// AC 3: 신규 계정 생성 시 전화번호 중복을 서비스 레이어가 사전에 확인하기 위한 조회.
export async function findByPhoneNumber(phoneNumber: string): Promise<Member | undefined> {
  return db.query.user.findFirst({ where: eq(user.phoneNumber, phoneNumber) });
}
