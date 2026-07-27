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

// Story 5.7 AC 2: 역할 변경 대상 조회(마지막 활성 관리자 보호 로직이 대상 계정의
// 현재 role/banned 상태를 확인하는 데 쓴다).
export async function findById(id: string): Promise<Member | undefined> {
  return db.query.user.findFirst({ where: eq(user.id, id) });
}
