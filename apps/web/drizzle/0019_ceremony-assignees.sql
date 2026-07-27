-- Custom SQL migration file, put your code below! --

-- 담당 오퍼레이터 다중 배정(2026-07-27 대표 지시, 프로토타입 WeddingScreen.js의
-- assignees 배열과 동일 모델). Story 5.8의 단일 컬럼(assigned_operator_id)을
-- 조인 테이블로 대체하고, 기존 배정 데이터는 옮긴 뒤 컬럼을 제거한다.
CREATE TABLE "ceremony_assignees" (
	"ceremony_id" uuid NOT NULL,
	"operator_id" text NOT NULL,
	"hall_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ceremony_assignees_ceremony_id_operator_id_pk" PRIMARY KEY("ceremony_id","operator_id")
);
--> statement-breakpoint
ALTER TABLE "ceremony_assignees" ADD CONSTRAINT "ceremony_assignees_ceremony_id_ceremonies_id_fk" FOREIGN KEY ("ceremony_id") REFERENCES "public"."ceremonies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ceremony_assignees" ADD CONSTRAINT "ceremony_assignees_operator_id_user_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ceremony_assignees" ADD CONSTRAINT "ceremony_assignees_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "ceremony_assignees" ("ceremony_id", "operator_id", "hall_id")
SELECT "id", "assigned_operator_id", "hall_id" FROM "ceremonies" WHERE "assigned_operator_id" IS NOT NULL;
--> statement-breakpoint
-- 인라인 REFERENCES(0017)로 만들어진 FK는 컬럼 삭제 시 함께 제거된다.
ALTER TABLE "ceremonies" DROP COLUMN "assigned_operator_id";
