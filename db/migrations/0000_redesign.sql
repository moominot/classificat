CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`preferences` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_uniq` ON `accounts` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_person_uniq` ON `accounts` (`person_id`);--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`category` text,
	`title` text NOT NULL,
	`body` text,
	`image_url` text,
	`published_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `announcements_tournament_idx` ON `announcements` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`person_id` text NOT NULL,
	`group_id` text,
	`team_id` text,
	`rating` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_tournament_person_uniq` ON `entries` (`tournament_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `entries_tournament_idx` ON `entries` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `entries_person_idx` ON `entries` (`person_id`);--> statement-breakpoint
CREATE INDEX `entries_group_idx` ON `entries` (`group_id`);--> statement-breakpoint
CREATE INDEX `entries_team_idx` ON `entries` (`team_id`);--> statement-breakpoint
CREATE TABLE `entry_claims` (
	`entry_id` text NOT NULL,
	`device_id` text NOT NULL,
	`claimed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`entry_id`, `device_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_claims_entry_idx` ON `entry_claims` (`entry_id`);--> statement-breakpoint
CREATE TABLE `game_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_profiles_name_uniq` ON `game_profiles` (`name`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `groups_tournament_idx` ON `groups` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`person_id` text NOT NULL,
	`tournament_id` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer,
	`accepted_at` integer,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_uniq` ON `invitations` (`token`);--> statement-breakpoint
CREATE INDEX `invitations_person_idx` ON `invitations` (`person_id`);--> statement-breakpoint
CREATE TABLE `match_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`participant_id` text,
	`question_id` text NOT NULL,
	`text_value` text,
	`number_value` integer,
	`image_url` text,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `match_participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `question_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `match_answers_match_idx` ON `match_answers` (`match_id`);--> statement-breakpoint
CREATE INDEX `match_answers_question_idx` ON `match_answers` (`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_answers_uniq` ON `match_answers` (`match_id`,`question_id`,`participant_id`);--> statement-breakpoint
CREATE TABLE `match_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`seat` integer NOT NULL,
	`rank` integer,
	`score` integer,
	`outcome` text,
	`points` real,
	`team_id` text,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_participants_match_entry_uniq` ON `match_participants` (`match_id`,`entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_participants_match_seat_uniq` ON `match_participants` (`match_id`,`seat`);--> statement-breakpoint
CREATE INDEX `match_participants_entry_idx` ON `match_participants` (`entry_id`);--> statement-breakpoint
CREATE INDEX `match_participants_team_idx` ON `match_participants` (`team_id`);--> statement-breakpoint
CREATE TABLE `match_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_account_id` text,
	`actor_entry_id` text,
	`device_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`before` text,
	`after` text,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `match_revisions_match_idx` ON `match_revisions` (`match_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`table_number` integer NOT NULL,
	`location` text,
	`comments` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matches_round_idx` ON `matches` (`round_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_round_table_uniq` ON `matches` (`round_id`,`table_number`);--> statement-breakpoint
CREATE TABLE `meetup_attendance` (
	`meetup_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`meetup_id`, `entry_id`),
	FOREIGN KEY (`meetup_id`) REFERENCES `meetups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meetups` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`round_id` text,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`location` text,
	`description` text,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `meetups_tournament_idx` ON `meetups` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`full_name` text,
	`alias` text,
	`photo_url` text,
	`club` text,
	`rating` integer,
	`phone` text,
	`email` text,
	`is_anonymized` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `people_display_name_idx` ON `people` (`display_name`);--> statement-breakpoint
CREATE INDEX `people_club_idx` ON `people` (`club`);--> statement-breakpoint
CREATE TABLE `person_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_person_id` text NOT NULL,
	`target_person_id` text NOT NULL,
	`performed_by` text NOT NULL,
	`performed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`undo_payload` text NOT NULL,
	`undone_at` integer,
	FOREIGN KEY (`performed_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `person_merges_target_idx` ON `person_merges` (`target_person_id`);--> statement-breakpoint
CREATE TABLE `phases` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`order` integer NOT NULL,
	`name` text NOT NULL,
	`method` text NOT NULL,
	`config` text NOT NULL,
	`participants_per_match` integer DEFAULT 2 NOT NULL,
	`scoring` text NOT NULL,
	`tiebreakers` text DEFAULT '[]' NOT NULL,
	`standings_scope` text DEFAULT '["global"]' NOT NULL,
	`team_aggregation` text,
	`start_round` integer NOT NULL,
	`end_round` integer NOT NULL,
	`is_complete` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `phases_tournament_idx` ON `phases` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `phases_order_uniq` ON `phases` (`tournament_id`,`order`);--> statement-breakpoint
CREATE TABLE `question_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`key` text NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`type` text NOT NULL,
	`scope` text NOT NULL,
	`label` text NOT NULL,
	`label1` text,
	`label2` text,
	`answer_type` text,
	`aggregate` text DEFAULT 'none' NOT NULL,
	`usable_as_tiebreaker` integer DEFAULT false NOT NULL,
	`show_in_ranking` integer DEFAULT false NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_definitions_tournament_idx` ON `question_definitions` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `question_definitions_tournament_key_uniq` ON `question_definitions` (`tournament_id`,`key`);--> statement-breakpoint
CREATE TABLE `round_absences` (
	`round_id` text NOT NULL,
	`entry_id` text NOT NULL,
	PRIMARY KEY(`round_id`, `entry_id`),
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `round_absences_round_idx` ON `round_absences` (`round_id`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`phase_id` text NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`pairings_visible` integer,
	`results_visible` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_tournament_number_uniq` ON `rounds` (`tournament_id`,`number`);--> statement-breakpoint
CREATE INDEX `rounds_phase_idx` ON `rounds` (`phase_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teams_tournament_idx` ON `teams` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `tournament_admins` (
	`tournament_id` text NOT NULL,
	`account_id` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`tournament_id`, `account_id`),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tournament_admins_account_idx` ON `tournament_admins` (`account_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`game_profile_id` text,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_profile_id`) REFERENCES `game_profiles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_slug_uniq` ON `tournaments` (`slug`);--> statement-breakpoint
CREATE INDEX `tournaments_owner_idx` ON `tournaments` (`owner_id`);