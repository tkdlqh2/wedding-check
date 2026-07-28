-- 대표 지시(2026-07-28): 예식 상세에서 올린 시연 영상은 그 예식에만 반영돼야 한다 —
-- 홀 공용 demo_videos(템플릿 항목 소속)를 건드리지 않고, 인스턴스 항목 행에 예식
-- 전용 영상 URL을 직접 저장한다. 값이 있으면 템플릿 영상보다 우선한다(오버라이드).
ALTER TABLE "checklist_instance_items" ADD COLUMN "video_url" text;
