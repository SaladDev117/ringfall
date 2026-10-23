CREATE TABLE "armies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" integer NOT NULL,
	"owner_base_id" uuid NOT NULL,
	"target_base_id" uuid,
	"target_nest_id" uuid,
	"mission" text NOT NULL,
	"units" jsonb NOT NULL,
	"survivors" jsonb,
	"loot" jsonb DEFAULT '{"alloy":0,"plasma":0,"relics":0}'::jsonb NOT NULL,
	"origin_x" integer NOT NULL,
	"origin_y" integer NOT NULL,
	"target_x" integer NOT NULL,
	"target_y" integer NOT NULL,
	"departs_at" timestamp with time zone NOT NULL,
	"arrives_at" timestamp with time zone NOT NULL,
	"returns_at" timestamp with time zone,
	"status" text DEFAULT 'outbound' NOT NULL,
	"recalled_at" timestamp with time zone,
	"report_id" uuid
);
--> statement-breakpoint
CREATE TABLE "bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"sector" integer NOT NULL,
	"resources" jsonb NOT NULL,
	"resources_at" timestamp with time zone NOT NULL,
	"levels" jsonb NOT NULL,
	"units" jsonb NOT NULL,
	"builds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"training" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"season_day_at_join" integer DEFAULT 0 NOT NULL,
	"protection_broken" boolean DEFAULT false NOT NULL,
	"shield_until" timestamp with time zone,
	"power" integer DEFAULT 0 NOT NULL,
	"next_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"sector" integer NOT NULL,
	"level" integer NOT NULL,
	"garrison" jsonb NOT NULL,
	"garrison_at" timestamp with time zone NOT NULL,
	"active_at" timestamp with time zone NOT NULL,
	"cleared_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"ref" text,
	"send_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" integer NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"attacker_user_id" uuid,
	"defender_user_id" uuid,
	"data" jsonb NOT NULL,
	"attacker_seen" boolean DEFAULT false NOT NULL,
	"defender_seen" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"invite_code" text NOT NULL,
	"recovery_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "armies" ADD CONSTRAINT "armies_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "armies" ADD CONSTRAINT "armies_owner_base_id_bases_id_fk" FOREIGN KEY ("owner_base_id") REFERENCES "public"."bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "armies" ADD CONSTRAINT "armies_target_base_id_bases_id_fk" FOREIGN KEY ("target_base_id") REFERENCES "public"."bases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "armies" ADD CONSTRAINT "armies_target_nest_id_nests_id_fk" FOREIGN KEY ("target_nest_id") REFERENCES "public"."nests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bases" ADD CONSTRAINT "bases_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bases" ADD CONSTRAINT "bases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nests" ADD CONSTRAINT "nests_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_attacker_user_id_users_id_fk" FOREIGN KEY ("attacker_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_defender_user_id_users_id_fk" FOREIGN KEY ("defender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "armies_status_arrives_idx" ON "armies" USING btree ("status","arrives_at");--> statement-breakpoint
CREATE INDEX "armies_owner_status_idx" ON "armies" USING btree ("owner_base_id","status");--> statement-breakpoint
CREATE INDEX "armies_target_status_idx" ON "armies" USING btree ("target_base_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bases_season_user_idx" ON "bases" USING btree ("season_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bases_season_xy_idx" ON "bases" USING btree ("season_id","x","y");--> statement-breakpoint
CREATE INDEX "bases_season_sector_idx" ON "bases" USING btree ("season_id","sector");--> statement-breakpoint
CREATE INDEX "bases_next_event_idx" ON "bases" USING btree ("next_event_at");--> statement-breakpoint
CREATE INDEX "nests_season_sector_idx" ON "nests" USING btree ("season_id","sector");--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("sent_at","send_at");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_attacker_idx" ON "reports" USING btree ("attacker_user_id","at");--> statement-breakpoint
CREATE INDEX "reports_defender_idx" ON "reports" USING btree ("defender_user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_active_idx" ON "seasons" USING btree ("status") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_invite_code_idx" ON "users" USING btree ("invite_code");