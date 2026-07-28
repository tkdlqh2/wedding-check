CREATE TABLE "insight_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"root_case_id" uuid NOT NULL,
	"label" text NOT NULL,
	"step_name" text NOT NULL,
	"member_case_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"members_hash" text NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "insight_clusters_root_case_id_unique" UNIQUE("root_case_id")
);
--> statement-breakpoint
CREATE TABLE "insight_recompute_state" (
	"id" text PRIMARY KEY NOT NULL,
	"running_since" timestamp,
	"lock_expires_at" timestamp,
	"run_token" text,
	"last_completed_at" timestamp,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "insight_clusters" ADD CONSTRAINT "insight_clusters_root_case_id_variable_cases_id_fk" FOREIGN KEY ("root_case_id") REFERENCES "public"."variable_cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- 상태 행은 정확히 하나만 존재한다(AD-7 단일 소유자). drizzle의 pgTable 빌더가 CHECK를
-- 표현하지 못해 수기로 추가한다.
ALTER TABLE "insight_recompute_state" ADD CONSTRAINT "insight_recompute_state_singleton_check" CHECK ("id" = 'singleton');
--> statement-breakpoint
-- 이 시드가 없으면 acquireLock의 조건부 UPDATE가 영원히 0행을 반환해 배치가 절대
-- 실행되지 않는다(락은 있는 행을 갱신하는 방식이라 행 자체가 선행 조건이다).
INSERT INTO "insight_recompute_state" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;
