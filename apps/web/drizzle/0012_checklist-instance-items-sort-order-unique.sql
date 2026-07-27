-- 코덱스 리뷰 4차 P2: 동시에 서로 다른 두 항목을 addItem()하면 두 INSERT가 같은
-- max(sort_order)+1을 계산해 이 제약 없이는 둘 다 그대로 성공, 순서가 비결정적이
-- 되고 같은 단계 항목이 비연속으로 흩어질 수 있었다. 위반 시 addItem()이 재시도한다
-- (template-item.ts::withConcurrencyRetry와 동일 패턴).
ALTER TABLE "checklist_instance_items" ADD CONSTRAINT "checklist_instance_items_instance_id_sort_order_unique" UNIQUE("instance_id","sort_order");
