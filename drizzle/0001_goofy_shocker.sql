CREATE TABLE `adapters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`app_id` integer,
	`builtin` integer DEFAULT false NOT NULL,
	`definition` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`app_id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`install_path` text,
	`mods_path` text,
	`link_mode` text DEFAULT 'junction' NOT NULL,
	`adapter_id` text,
	`detected_game_version` text,
	`manual_game_version` text,
	`account_id` integer,
	`auto_update` integer DEFAULT false NOT NULL,
	`retention` integer DEFAULT 3 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` integer NOT NULL,
	`item_ids` text NOT NULL,
	`account_id` integer,
	`status` text NOT NULL,
	`worker_slot` integer,
	`bytes_done` integer DEFAULT 0 NOT NULL,
	`bytes_total` integer DEFAULT 0 NOT NULL,
	`error` text,
	`log_tail` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`app_id` integer NOT NULL,
	`link_path` text NOT NULL,
	`snapshot_id` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_item_id_unique` ON `links` (`item_id`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`time_updated` integer NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`downloaded_at` integer NOT NULL,
	`item_versions` text DEFAULT '[]' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_item_time` ON `snapshots` (`item_id`,`time_updated`);--> statement-breakpoint
CREATE TABLE `steam_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`last_login_ok` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `steam_accounts_username_unique` ON `steam_accounts` (`username`);--> statement-breakpoint
CREATE TABLE `workshop_items` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`author` text,
	`preview_url` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`remote_time_updated` integer DEFAULT 0 NOT NULL,
	`file_size` integer DEFAULT 0 NOT NULL,
	`active_snapshot_id` integer,
	`pinned` integer DEFAULT false NOT NULL,
	`auto_update` integer DEFAULT true NOT NULL,
	`added_at` integer NOT NULL
);
