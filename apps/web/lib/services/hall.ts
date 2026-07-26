import * as hallRepo from "../db/repositories/hall";
import type { Hall } from "../db/repositories/hall";

export type { Hall };

export class HallValidationError extends Error {}

function assertValidName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    // AC 2: 서버 사이드 검증이 실제 안전장치다 — 클라이언트 검증만으로는 불충분.
    throw new HallValidationError("홀명은 필수입니다");
  }
  return trimmed;
}

export async function createHall(input: { name: string }): Promise<Hall> {
  const name = assertValidName(input.name);
  return hallRepo.create({ name });
}

export async function listActiveHalls(): Promise<Hall[]> {
  return hallRepo.findAllActive();
}

export async function updateHall(id: string, input: { name: string }): Promise<Hall> {
  const name = assertValidName(input.name);
  return hallRepo.update(id, { name });
}

export async function deactivateHall(id: string): Promise<void> {
  await hallRepo.deactivate(id);
}
