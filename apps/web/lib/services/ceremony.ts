import * as ceremonyRepo from "../db/repositories/ceremony";
import * as hallRepo from "../db/repositories/hall";
import type { Ceremony, CeremonyWithItemCount } from "../db/repositories/ceremony";

export type { Ceremony, CeremonyWithItemCount };

export class CeremonyValidationError extends Error {}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// "오늘"은 한국 표준시(KST, UTC+9) 달력 기준이다 — 국내 단일 웨딩홀 대상 제품이라
// UTC 자정을 기준 삼으면 KST 오전 0~9시 사이에 하루가 밀려 보이는 버그가 생긴다.
function todayRangeKST(): { start: Date; end: Date } {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const d = nowKst.getUTCDate();
  const startOfKstDayInUtc = Date.UTC(y, m, d, 0, 0, 0) - KST_OFFSET_MS;
  return {
    start: new Date(startOfKstDayInUtc),
    end: new Date(startOfKstDayInUtc + 24 * 60 * 60 * 1000),
  };
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
}): Promise<Ceremony> {
  await assertHallExists(input.hallId);
  const { ceremonyId } = await ceremonyRepo.create(input.hallId, {
    ceremonyAt: input.ceremonyAt,
    contractConditions: input.contractConditions,
  });
  const ceremony = await ceremonyRepo.findById(input.hallId, ceremonyId);
  if (!ceremony) {
    throw new Error("예식 생성 직후 조회에 실패했습니다");
  }
  return ceremony;
}

export type CeremonyWithHallName = CeremonyWithItemCount & { hallName: string };

// AD-2는 리포지토리 함수가 hallId를 필수 첫 인자로 받으라는 규칙이다. 관리자 예식
// 목록 화면은 전체 홀을 가로질러 "오늘 예식"을 보여줘야 하므로, 활성 홀 목록을 얻은
// 뒤 각 홀에 대해 hallId가 스코프된 리포지토리 함수를 개별 호출하고 병합한다 — 서비스가
// SQL을 직접 쓰지 않고 리포지토리만 호출한다는 AD-2 상위 규칙도 그대로 지킨다.
export async function listTodaysCeremonies(): Promise<CeremonyWithHallName[]> {
  const halls = await hallRepo.findAllActive();
  const { start, end } = todayRangeKST();
  const results = await Promise.all(
    halls.map(async (hall) => {
      const hallCeremonies = await ceremonyRepo.findByHallForDateRange(hall.id, start, end);
      return hallCeremonies.map((c) => ({ ...c, hallName: hall.name }));
    }),
  );
  return results.flat().sort((a, b) => a.ceremonyAt.getTime() - b.ceremonyAt.getTime());
}
