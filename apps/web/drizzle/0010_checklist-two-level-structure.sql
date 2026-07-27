-- Story 5.5: 체크리스트 템플릿을 "단계"(이름만) + "체크리스트 항목"(제목 필수, 설명·영상
-- 선택)의 2단계 구조로 전환한다.
--
-- 데이터 손실 고지(의도된 것, 프로덕션 고객 데이터 없는 파일럿 단계):
--   - demo_videos: 현재 0행(로컬/dev 확인) — 손실 없음.
--   - checklist_instance_items: 기존 행은 "단계" 스냅샷이라 새 "체크리스트 항목" 스냅샷
--     구조(title 필수)로 무의미한 값 없이는 옮길 수 없다. 현재 2행뿐이고 전부 이전
--     스토리들의 수동 검증용 테스트 데이터라 삭제한다 — 해당 예식들은 재등록하면 새
--     구조로 인스턴스가 다시 생성된다.

-- 1) checklist_template_items: description 컬럼 제거(체크리스트 항목으로 이동)
ALTER TABLE "checklist_template_items" DROP COLUMN "description";
--> statement-breakpoint

-- 2) checklist_template_item_checks: 신규 "체크리스트 항목" 테이블
CREATE TABLE "checklist_template_item_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hall_id" uuid NOT NULL,
	"template_item_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_template_item_checks" ADD CONSTRAINT "checklist_template_item_checks_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "checklist_template_item_checks" ADD CONSTRAINT "checklist_template_item_checks_template_item_id_checklist_template_items_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "public"."checklist_template_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- checklist_template_items와 동일한 이유로 DEFERRABLE — moveAdjacent의 스왑 UPDATE가
-- 두 행의 sort_order를 맞바꾸는 중간 상태에서 즉시 위반으로 걸리지 않게 한다.
ALTER TABLE "checklist_template_item_checks" ADD CONSTRAINT "checklist_template_item_checks_template_item_id_sort_order_unique" UNIQUE("template_item_id","sort_order") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

-- 3) demo_videos: template_item_id -> checklist_item_id (연결 대상을 단계에서 체크리스트
--    항목으로 변경). 기존 행은 새 체크리스트 항목 구조가 아직 없어 백필할 수 없으므로
--    삭제한다(dev DB는 0행이라 영향 없음, 테스트 DB는 resetDb()로 어차피 매 테스트마다
--    비워지는 데이터).
DELETE FROM "demo_videos";
--> statement-breakpoint
ALTER TABLE "demo_videos" DROP CONSTRAINT "demo_videos_template_item_id_checklist_template_items_id_fk";
--> statement-breakpoint
ALTER TABLE "demo_videos" DROP CONSTRAINT "demo_videos_template_item_id_unique";
--> statement-breakpoint
ALTER TABLE "demo_videos" DROP COLUMN "template_item_id";
--> statement-breakpoint
ALTER TABLE "demo_videos" ADD COLUMN "checklist_item_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "demo_videos" ADD CONSTRAINT "demo_videos_checklist_item_id_checklist_template_item_checks_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_template_item_checks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "demo_videos" ADD CONSTRAINT "demo_videos_checklist_item_id_unique" UNIQUE("checklist_item_id");
--> statement-breakpoint

-- 4) checklist_instance_items: template_item_id(단계 소프트 참조) -> template_item_check_id
--    (체크리스트 항목 소프트 참조) + title 스냅샷 컬럼 추가. 기존 행은 위 고지대로 삭제.
DELETE FROM "checklist_instance_items";
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" DROP CONSTRAINT "checklist_instance_items_instance_id_template_item_id_unique";
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" DROP CONSTRAINT "checklist_instance_items_template_item_id_checklist_template_it";
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" DROP COLUMN "template_item_id";
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD COLUMN "template_item_check_id" uuid;
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD COLUMN "title" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD CONSTRAINT "checklist_instance_items_template_item_check_id_checklist_temp" FOREIGN KEY ("template_item_check_id") REFERENCES "public"."checklist_template_item_checks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD CONSTRAINT "checklist_instance_items_instance_id_template_item_check_id_un" UNIQUE("instance_id","template_item_check_id");
