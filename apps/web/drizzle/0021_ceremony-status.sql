-- Custom SQL migration file, put your code below! --

-- 예식 진행 상태(upcoming/ongoing/done)를 저장 필드로 승격(2026-07-27 대표 지시:
-- 상태는 시간으로 추정하는 게 아니라 오퍼레이터가 실행 화면에서 직접 변경한다 —
-- prototype RunScreen.js의 예식 시작/종료 버튼). 기존 데이터는 예식 일시가 이미 지난
-- 것만 done으로 백필한다(과거 예식이 계속 수정 가능 상태로 남지 않도록).
ALTER TABLE "ceremonies" ADD COLUMN "status" text NOT NULL DEFAULT 'upcoming';
--> statement-breakpoint
UPDATE "ceremonies" SET "status" = 'done' WHERE "ceremony_at" < now();
