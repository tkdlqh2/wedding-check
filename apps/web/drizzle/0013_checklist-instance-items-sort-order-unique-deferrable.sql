-- 코덱스 리뷰 6차 P1: checklist_template_items/checklist_template_item_checks의
-- (…, sort_order) UNIQUE 제약과 달리, 0012에서 만든 이 제약은 DEFERRABLE로 만들지
-- 않았다. addItem()의 "밀기" UPDATE가 한 문장 안에서 여러 행의 sort_order를 +1씩
-- 올릴 때(예: 3→4, 4→5, 5→6), NOT DEFERRABLE 제약은 각 행이 갱신되는 즉시 유일성을
-- 검사해 아직 갱신 전인 다른 행과 일시적으로 충돌한다(3→4로 바뀌는 순간 아직 4인
-- 행이 남아있으면 위반) — moveAdjacent의 스왑과 동일한 클래스의 문제라 동일하게
-- DEFERRABLE INITIALLY DEFERRED로 고친다(문장 전체가 끝날 때까지 검사를 미뤄, 같은
-- 문장 안의 일시적 상태는 위반으로 걸리지 않는다).
ALTER TABLE "checklist_instance_items" DROP CONSTRAINT "checklist_instance_items_instance_id_sort_order_unique";
--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD CONSTRAINT "checklist_instance_items_instance_id_sort_order_unique" UNIQUE("instance_id","sort_order") DEFERRABLE INITIALLY DEFERRED;
