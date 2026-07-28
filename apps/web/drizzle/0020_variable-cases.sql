CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "situation" text;
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "outcome" text;
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "rationale" text;
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE "variable_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hall_id" uuid NOT NULL,
	"feedback_id" uuid NOT NULL,
	"step_name" text NOT NULL,
	"situation" text NOT NULL,
	"outcome" text NOT NULL,
	"rationale" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "variable_cases_feedback_id_unique" UNIQUE("feedback_id")
);
--> statement-breakpoint
ALTER TABLE "variable_cases" ADD CONSTRAINT "variable_cases_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "variable_cases" ADD CONSTRAINT "variable_cases_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE no action ON UPDATE no action;
