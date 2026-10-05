CREATE TABLE `entry_tags` (
	`entry_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_tags_uniq` ON `entry_tags` (`entry_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `entry_tags_entry_idx` ON `entry_tags` (`entry_id`);--> statement-breakpoint
CREATE INDEX `entry_tags_tag_idx` ON `entry_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_tournament_idx` ON `tags` (`tournament_id`);--> statement-breakpoint
INSERT INTO `tags` (`id`, `tournament_id`, `name`, `created_at`)
  SELECT `id`, `tournament_id`, `name`, unixepoch() FROM `groups`;--> statement-breakpoint
INSERT INTO `entry_tags` (`entry_id`, `tag_id`)
  SELECT `id`, `group_id` FROM `entries` WHERE `group_id` IS NOT NULL;