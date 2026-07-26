CREATE TABLE "ceremonies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hall_id" uuid NOT NULL,
	"ceremony_at" timestamp NOT NULL,
	"contract_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_instance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hall_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"template_item_id" uuid,
	"step_name" text NOT NULL,
	"description" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hall_id" uuid NOT NULL,
	"ceremony_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_instances_ceremony_id_unique" UNIQUE("ceremony_id")
);
--> statement-breakpoint
ALTER TABLE "ceremonies" ADD CONSTRAINT "ceremonies_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD CONSTRAINT "checklist_instance_items_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD CONSTRAINT "checklist_instance_items_instance_id_checklist_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."checklist_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_instance_items" ADD CONSTRAINT "checklist_instance_items_template_item_id_checklist_template_items_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "public"."checklist_template_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_ceremony_id_ceremonies_id_fk" FOREIGN KEY ("ceremony_id") REFERENCES "public"."ceremonies"("id") ON DELETE no action ON UPDATE no action;