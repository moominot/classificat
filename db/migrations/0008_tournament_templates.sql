CREATE TABLE `tournament_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text,
	`is_builtin` integer DEFAULT false NOT NULL,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tournament_templates_owner_idx` ON `tournament_templates` (`owner_id`);--> statement-breakpoint
ALTER TABLE `tournaments` ADD `template_id` text REFERENCES tournament_templates(id) ON DELETE set null;
