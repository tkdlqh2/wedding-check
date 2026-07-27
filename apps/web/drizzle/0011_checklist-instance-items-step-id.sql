-- Story 5.5 코덱스 리뷰 3차 P2: 인스턴스 항목 스냅샷에 소속 단계(stepName 텍스트만)를
-- 그룹핑 키로 쓰면, 관리자가 같은 이름의 단계를 두 개 만든 경우 서로 다른 단계가
-- 오퍼레이터/관리자 화면에서 하나로 합쳐질 수 있었다. 단계로의 안정적인 소프트 참조
-- (template_item_id, Story 5.5 이전에 이미 있던 것과 동일한 이름·의미 — 체크리스트
-- 항목을 가리키는 template_item_check_id와는 별개)를 추가한다.
ALTER TABLE "checklist_instance_items" ADD COLUMN "template_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD CONSTRAINT "checklist_instance_items_template_item_id_checklist_template_i" FOREIGN KEY ("template_item_id") REFERENCES "public"."checklist_template_items"("id") ON DELETE set null ON UPDATE no action;
