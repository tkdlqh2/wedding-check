-- Custom SQL migration file, put your code below! --
ALTER TABLE "ceremonies" ADD COLUMN "assigned_operator_id" text REFERENCES "user"("id") ON DELETE SET NULL;
