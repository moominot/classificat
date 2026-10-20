ALTER TABLE `tags` ADD `kind` text DEFAULT 'label' NOT NULL;--> statement-breakpoint
ALTER TABLE `tags` ADD `order` integer DEFAULT 0 NOT NULL;
