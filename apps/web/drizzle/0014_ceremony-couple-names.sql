-- Custom SQL migration file, put your code below! --
ALTER TABLE "ceremonies" ADD COLUMN "groom_name" text;
ALTER TABLE "ceremonies" ADD COLUMN "bride_name" text;
