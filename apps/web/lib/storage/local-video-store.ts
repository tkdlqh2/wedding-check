import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// 서버 전용(fs 사용) — 클라이언트 컴포넌트에서 import 금지.
const LOCAL_VIDEO_DIR = path.join(process.cwd(), ".local-blob", "demo-videos");

const LOCAL_VIDEO_FILE_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/i;

export function isValidLocalVideoFileName(name: string): boolean {
  return LOCAL_VIDEO_FILE_NAME_PATTERN.test(name);
}

export function localVideoFilePath(fileName: string): string {
  return path.join(LOCAL_VIDEO_DIR, fileName);
}

export async function saveLocalVideoFile(
  file: File,
): Promise<{ url: string; fileName: string; sizeBytes: number }> {
  await mkdir(LOCAL_VIDEO_DIR, { recursive: true });
  // 원본 파일명을 저장 경로에 그대로 쓰지 않는다 — 경로 조작/충돌 방지(고정 확장자 .mp4).
  const storedName = `${randomUUID()}.mp4`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(localVideoFilePath(storedName), buffer);
  return {
    url: `/api/local-videos/${storedName}`,
    fileName: file.name,
    sizeBytes: buffer.byteLength,
  };
}
