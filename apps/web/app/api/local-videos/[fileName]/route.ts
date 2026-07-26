import { createReadStream } from "fs";
import { stat } from "fs/promises";
import type { NextRequest } from "next/server";
import {
  isValidLocalVideoFileName,
  localVideoFilePath,
} from "@/lib/storage/local-video-store";

// Story 1.4 로컬 폴백 전용 서빙 라우트 — BLOB_READ_WRITE_TOKEN이 없을 때 저장된 영상을
// 이 라우트로 서빙한다(storageProvider: "local"). 토큰이 나중에 생겨도 이미 로컬로
// 저장된 영상은 계속 이 라우트로 서빙됨(마이그레이션 불필요, 두 provider 영구 공존).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await params;

  // path traversal 차단 — 저장 시 생성한 형식(uuid.mp4)과 정확히 일치해야만 서빙한다.
  if (!isValidLocalVideoFileName(fileName)) {
    return new Response(null, { status: 404 });
  }

  const filePath = localVideoFilePath(fileName);
  let fileSize: number;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    return new Response(null, { status: 404 });
  }

  const range = request.headers.get("range");

  // HTML5 <video>는 재생/탐색(seek) 시 Range 헤더를 보낸다 — 이를 무시하면 첫 재생은
  // 되어도 탐색(스크럽)이 깨진다.
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
    if (start >= fileSize || end >= fileSize || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const stream = createReadStream(filePath, { start, end });
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const stream = createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
    },
  });
}
