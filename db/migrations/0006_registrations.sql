ALTER TABLE `tournaments` ADD `location` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `info` text;--> statement-breakpoint
CREATE TABLE `registration_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`person_id` text,
	`account_id` text,
	`display_name` text NOT NULL,
	`club` text,
	`rating` integer,
	`barruf_numero` integer,
	`device_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`entry_id` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `registration_requests_tournament_idx` ON `registration_requests` (`tournament_id`,`status`);
