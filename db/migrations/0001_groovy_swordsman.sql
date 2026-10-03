CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `people` ADD `barruf_numero` integer;