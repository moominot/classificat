ALTER TABLE `tournaments` ADD `short_path` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_short_path_uniq` ON `tournaments` (`short_path`);
