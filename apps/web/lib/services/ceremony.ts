import * as ceremonyRepo from "../db/repositories/ceremony";
import * as hallRepo from "../db/repositories/hall";
import * as memberRepo from "../db/repositories/member";
import type { Ceremony, CeremonyWithItemCount } from "../db/repositories/ceremony";

export type { Ceremony, CeremonyWithItemCount };

export class CeremonyValidationError extends Error {}

// FR-18 다중 배정: 목록 카드의 담당 오퍼레이터 pill 표시/토글에 필요한 병합용 id→name
// 맵. hallName 병합과 동일한 스타일(리포지토리에 조인을 넣지 않고 서비스에서 메모리
// 병합) — memberRepo.findAll()을 목록 조회당 한 번만 호출한다(N+1 방지).
async function buildOperatorNameMap(): Promise<Map<string, string>> {
  const members = await memberRepo.findAll();
  return new Map(members.map((m) => [m.id, m.name]));
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// "오늘"은 한국 표준시(KST, UTC+9) 달력 기준이다 — 국내 단일 웨딩홀 대상 제품이라
// UTC 자정을 기준 삼으면 KST 오전 0~9시 사이에 하루가 밀려 보이는 버그가 생긴다.
function todayRangeKST(): { start: Date; end: Date } {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const d = nowKst.getUTCDate();
  return dayRangeKSTFromParts(y, m, d);
}

function dayRangeKSTFromParts(y: number, m: number, d: number): { start: Date; end: Date } {
  const startOfKstDayInUtc = Date.UTC(y, m, d, 0, 0, 0) - KST_OFFSET_MS;
  return {
    start: new Date(startOfKstDayInUtc),
    end: new Date(startOfKstDayInUtc + 24 * 60 * 60 * 1000),
  };
}

// Story 5.2: 캘린더에서 선택한 임의의 날짜(YYYY-MM-DD, KST 달력 기준)의 예식 범위.
// todayRangeKST와 동일한 KST 자정 경계 계산을 재사용한다(Story 2.1 타임존 버그 재발 방지).
function dayRangeKST(dateIso: string): { start: Date; end: Date } {
  const [y, m, d] = dateIso.split("-").map(Number);
  return dayRangeKSTFromParts(y, m - 1, d);
}

// Story 5.2: 캘린더 월 이동(연/월, 1~12)의 KST 월 경계 — 다음 달 1일 KST 자정 직전까지.
function monthRangeKST(year: number, month: number): { start: Date; end: Date } {
  const startOfKstMonthInUtc = Date.UTC(year, month - 1, 1, 0, 0, 0) - KST_OFFSET_MS;
  const startOfNextKstMonthInUtc = Date.UTC(year, month, 1, 0, 0, 0) - KST_OFFSET_MS;
  return {
    start: new Date(startOfKstMonthInUtc),
    end: new Date(startOfNextKstMonthInUtc),
  };
}

// UTC 인스턴트를 KST 달력 기준 "YYYY-MM-DD" 문자열로 변환(캘린더 점 마커 매칭용).
function toKstDateString(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function assertHallExists(hallId: string): Promise<void> {
  if (!hallId) {
    // AC 2: 홀을 선택하지 않고 저장을 시도하면 거부된다.
    throw new CeremonyValidationError("홀을 선택해주세요");
  }
  const hall = await hallRepo.findById(hallId);
  if (!hall) {
    throw new CeremonyValidationError("존재하지 않는 홀입니다");
  }
}

export async function createCeremony(input: {
  hallId: string;
  ceremonyAt: Date;
  contractConditions: Record<string, boolean>;
  groomName?: string;
  brideName?: string;
}): Promise<Ceremony> {
  await assertHallExists(input.hallId);
  const { ceremonyId } = await ceremonyRepo.create(input.hallId, {
    ceremonyAt: input.ceremonyAt,
    contractConditions: input.contractConditions,
    groomName: input.groomName?.trim() || null,
    brideName: input.brideName?.trim() || null,
  });
  const ceremony = await ceremonyRepo.findById(input.hallId, ceremonyId);
  if (!ceremony) {
    throw new Error("예식 생성 직후 조회에 실패했습니다");
  }
  return ceremony;
}

// FR-18 다중 배정(2026-07-27, 프로토타입 WeddingScreen.js의 assignees 토글과 동일):
// 이미 배정돼 있으면 해제, 아니면 배정. 배정 추가는 활성 오퍼레이터 역할 회원만 가능 —
// 해제는 그 담당자가 이후 비활성화/역할 변경됐어도 항상 허용한다(정리 수단 보존,
// Story 5.8 코덱스 리뷰의 stale 담당자 해제 불가 지적과 동일 원칙).
export async function toggleAssignee(
  hallId: string,
  ceremonyId: string,
  operatorId: string,
): Promise<void> {
  const ceremony = await ceremonyRepo.findById(hallId, ceremonyId);
  if (!ceremony) {
    throw new CeremonyValidationError("존재하지 않는 예식입니다");
  }
  const current = await ceremonyRepo.findAssigneesByCeremony(hallId, ceremonyId);
  if (current.some((a) => a.operatorId === operatorId)) {
    await ceremonyRepo.removeAssignee(hallId, ceremonyId, operatorId);
    return;
  }
  const operator = await memberRepo.findById(operatorId);
  if (!operator || operator.role !== "operator" || operator.banned) {
    throw new CeremonyValidationError("배정할 수 없는 담당자입니다");
  }
  await ceremonyRepo.addAssignee(hallId, ceremonyId, operatorId);
}

export type CeremonyAssigneeInfo = { id: string; name: string };

// 예식 상세 메타 줄("담당 김민지, 박서준") 표시용 — 프로토타입 WeddingDetailScreen.js
// 22행과 동일하게 상세에서는 읽기 전용, 배정 조작은 목록 카드의 pill 토글에서만 한다.
export async function listCeremonyAssignees(
  hallId: string,
  ceremonyId: string,
): Promise<CeremonyAssigneeInfo[]> {
  const [rows, operatorNames] = await Promise.all([
    ceremonyRepo.findAssigneesByCeremony(hallId, ceremonyId),
    buildOperatorNameMap(),
  ]);
  return rows.map((row) => ({
    id: row.operatorId,
    name: operatorNames.get(row.operatorId) ?? "이름 미확인",
  }));
}

export type CeremonyWithHallName = CeremonyWithItemCount & {
  hallName: string;
  assignees: CeremonyAssigneeInfo[];
};

// 홀 1개의 배정 행 전체를 ceremonyId별 {id, name}[] 맵으로 묶는다 — 이름이 없는(이론상
// 삭제된) 계정은 표시할 수 없으므로 제외하지 않고 id를 이름 대신 쓰지도 않고, "이름
// 미확인"으로 표기해 배정 자체가 화면에서 사라지지 않게 한다.
async function buildAssigneeMap(
  hallId: string,
  operatorNames: Map<string, string>,
): Promise<Map<string, CeremonyAssigneeInfo[]>> {
  const rows = await ceremonyRepo.findAssigneesByHall(hallId);
  const map = new Map<string, CeremonyAssigneeInfo[]>();
  for (const row of rows) {
    const list = map.get(row.ceremonyId) ?? [];
    list.push({ id: row.operatorId, name: operatorNames.get(row.operatorId) ?? "이름 미확인" });
    map.set(row.ceremonyId, list);
  }
  return map;
}

// AD-2는 리포지토리 함수가 hallId를 필수 첫 인자로 받으라는 규칙이다. 관리자 예식
// 목록 화면은 전체 홀을 가로질러 "오늘 예식"을 보여줘야 하므로, 활성 홀 목록을 얻은
// 뒤 각 홀에 대해 hallId가 스코프된 리포지토리 함수를 개별 호출하고 병합한다 — 서비스가
// SQL을 직접 쓰지 않고 리포지토리만 호출한다는 AD-2 상위 규칙도 그대로 지킨다.
export async function listTodaysCeremonies(): Promise<CeremonyWithHallName[]> {
  const [halls, operatorNames] = await Promise.all([
    hallRepo.findAllActive(),
    buildOperatorNameMap(),
  ]);
  const { start, end } = todayRangeKST();
  const results = await Promise.all(
    halls.map(async (hall) => {
      const [hallCeremonies, assigneeMap] = await Promise.all([
        ceremonyRepo.findByHallForDateRange(hall.id, start, end),
        buildAssigneeMap(hall.id, operatorNames),
      ]);
      return hallCeremonies.map((c) => ({
        ...c,
        hallName: hall.name,
        assignees: assigneeMap.get(c.id) ?? [],
      }));
    }),
  );
  return results.flat().sort((a, b) => a.ceremonyAt.getTime() - b.ceremonyAt.getTime());
}

// Story 5.2 AC 2: 캘린더에서 선택한 날짜(KST)의 예식만 홀 교차로 병합해 반환.
// hallRepo.findAll()을 쓴다(findAllActive() 아님) — 비활성화된 홀도 과거 예식은
// 보존되므로(§AC 3), 그 홀이 비활성화됐다는 이유만으로 조회 결과에서 사라지면 안 된다
// (코덱스 리뷰 P2).
export async function listCeremoniesForDate(dateIso: string): Promise<CeremonyWithHallName[]> {
  const [halls, operatorNames] = await Promise.all([hallRepo.findAll(), buildOperatorNameMap()]);
  const { start, end } = dayRangeKST(dateIso);
  const results = await Promise.all(
    halls.map(async (hall) => {
      const [hallCeremonies, assigneeMap] = await Promise.all([
        ceremonyRepo.findByHallForDateRange(hall.id, start, end),
        buildAssigneeMap(hall.id, operatorNames),
      ]);
      return hallCeremonies.map((c) => ({
        ...c,
        hallName: hall.name,
        assignees: assigneeMap.get(c.id) ?? [],
      }));
    }),
  );
  return results.flat().sort((a, b) => a.ceremonyAt.getTime() - b.ceremonyAt.getTime());
}

export type PaginatedCeremonies = {
  ceremonies: CeremonyWithHallName[];
  page: number;
  totalCount: number;
  totalPages: number;
};

// Story 5.2 AC 3: 날짜 필터가 없을 때의 기본 목록 — 예식 일시 역순, 페이지 단위.
// [ASSUMPTION] 단일 사업체 소규모 데이터셋(PRD §8.1) 전제로, listTodaysCeremonies와
// 동일하게 홀별로 전체 조회 후 메모리에서 병합·정렬·슬라이스한다 — 교차 홀 SQL
// 페이지네이션은 AD-2(리포지토리는 hallId 스코프 쿼리만 담당)와 맞지 않는다.
export async function listCeremoniesPaginated(input: {
  page: number;
  pageSize: number;
}): Promise<PaginatedCeremonies> {
  const [halls, operatorNames] = await Promise.all([hallRepo.findAll(), buildOperatorNameMap()]);
  const results = await Promise.all(
    halls.map(async (hall) => {
      const [hallCeremonies, assigneeMap] = await Promise.all([
        ceremonyRepo.findAllByHall(hall.id),
        buildAssigneeMap(hall.id, operatorNames),
      ]);
      return hallCeremonies.map((c) => ({
        ...c,
        hallName: hall.name,
        assignees: assigneeMap.get(c.id) ?? [],
      }));
    }),
  );
  const all = results.flat().sort((a, b) => b.ceremonyAt.getTime() - a.ceremonyAt.getTime());

  const totalCount = all.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / input.pageSize));
  // 호출부(page.tsx)가 URL 쿼리 파라미터를 그대로 넘길 수 있어 NaN/음수/소수가 들어올
  // 수 있다 — 여기서 안전한 정수로 정규화한 뒤 clamp한다. 코덱스 리뷰(P2): ?page=999처럼
  // 범위 밖 값이 와도 화면에는 실제로 보여준 페이지 번호가 표시돼야 하므로, clamp된 값을
  // 반환값에 포함해 호출부가 원본 쿼리 파라미터 대신 이 값을 렌더링하게 한다.
  const requestedPage = Number.isFinite(input.page) ? Math.trunc(input.page) : 1;
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIdx = (page - 1) * input.pageSize;

  return {
    ceremonies: all.slice(startIdx, startIdx + input.pageSize),
    page,
    totalCount,
    totalPages,
  };
}

// Story 5.2 AC 1: 캘린더에 점으로 표시할, 해당 KST 월에 예식이 1건 이상 있는 날짜 집합.
export async function listCeremonyDatesForMonth(
  year: number,
  month: number,
): Promise<Set<string>> {
  const halls = await hallRepo.findAll();
  const { start, end } = monthRangeKST(year, month);
  const results = await Promise.all(
    halls.map((hall) => ceremonyRepo.findByHallForDateRange(hall.id, start, end)),
  );
  const dates = new Set<string>();
  for (const ceremony of results.flat()) {
    dates.add(toKstDateString(ceremony.ceremonyAt));
  }
  return dates;
}
