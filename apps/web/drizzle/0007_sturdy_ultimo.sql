ALTER TABLE "demo_videos" DROP CONSTRAINT "demo_videos_template_item_id_checklist_template_items_id_fk";
--> statement-breakpoint
ALTER TABLE "demo_videos" ADD CONSTRAINT "demo_videos_template_item_id_checklist_template_items_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "public"."checklist_template_items"("id") ON DELETE cascade ON UPDATE no action;