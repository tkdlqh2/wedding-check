-- Custom SQL migration file, put your code below! --
ALTER TABLE "checklist_instance_items" ADD COLUMN "ad_hoc_group_root_id" uuid;
