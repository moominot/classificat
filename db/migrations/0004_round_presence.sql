ALTER TABLE `tournaments` ADD `presence_pending_as` text DEFAULT 'present' NOT NULL;--> statement-breakpoint
CREATE TABLE `round_presence` (
	`tournament_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`entry_id` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`device_id` text,
	`account_id` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`tournament_id`, `round_number`, `entry_id`),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `round_presence_round_idx` ON `round_presence` (`tournament_id`,`round_number`);
