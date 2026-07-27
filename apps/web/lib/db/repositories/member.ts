import { eq, desc, sql } from "drizzle-orm";
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

// 코덱스 리뷰 P2: "활성 관리자 수 확인" → "역할 변경"을 서비스 레이어에서 두 단계로
// 나눠 하면, 두 관리자가 동시에 자기 자신을 강등할 때 둘 다 카운트 확인(예: 2명)을
// 통과한 뒤 둘 다 UPDATE를 실행해 활성 관리자가 0명이 될 수 있다(TOCTOU 경합).
// db.transaction()은 프로덕션 드라이버(neon-http)에서 throw하므로 쓸 수 없다(Story 1.3
// P1) — 대신 단일 SQL 문 안에서 모든 활성 관리자 행을 `FOR UPDATE`로 잠그고, 잠긴
// 집합 기준으로 재확인한 카운트가 1보다 클 때만 UPDATE한다(ceremonyRepo.create()와
// 동일한 "단일 문으로 원자성 확보" 패턴). 두 요청이 동시에 들어오면 뒤에 도착한 요청은
// 앞선 요청의 커밋을 기다렸다가, 그 이후 상태(활성 관리자 1명)를 기준으로 재평가되어
// 0행만 갱신하고 실패로 처리된다.
export async function demoteIfNotLastActiveAdmin(targetId: string): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    with admin_lock as (
      select id from "user" where role = 'admin' and banned = false for update
    )
    update "user"
    set role = 'operator'
    where id = ${targetId}
      and role = 'admin'
      and (select count(*) from admin_lock) > 1
    returning id
  `);
  return result.rows.length > 0;
}
