-- 대표 지시(2026-07-28): 예식 상세의 "단계 추가"는 홀 템플릿처럼 단계명만으로 추가한다.
-- 인스턴스 모델에는 단계 테이블이 따로 없으므로(항목 행이 곧 단계 소속 표시), 항목이
-- 하나도 없는 새 단계는 title IS NULL인 자리표시 행(단계 마커)으로 표현한다 —
-- ad_hoc_group_root_id + step_name만 채워지고, 오퍼레이터 화면/체크 진행 집계에서는
-- 제외된다(서비스 레이어에서 필터링).
ALTER TABLE "checklist_instance_items" ALTER COLUMN "title" DROP NOT NULL;
