CREATE TABLE `snapshot_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_snapshot_id` integer,
	`to_snapshot_id` integer,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snapshot_events_app_at` ON `snapshot_events` (`app_id`,`at`);--> statement-breakpoint
ALTER TABLE `workshop_items` ADD `held` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: every existing snapshot became the linked one when its download finished.
INSERT INTO `snapshot_events` (`app_id`, `item_id`, `kind`, `from_snapshot_id`, `to_snapshot_id`, `at`)
SELECT w.`app_id`, s.`item_id`, 'download',
  (SELECT p.`id` FROM `snapshots` p WHERE p.`item_id` = s.`item_id` AND (p.`downloaded_at` < s.`downloaded_at` OR (p.`downloaded_at` = s.`downloaded_at` AND p.`id` < s.`id`)) ORDER BY p.`downloaded_at` DESC, p.`id` DESC LIMIT 1),
  s.`id`, s.`downloaded_at`
FROM `snapshots` s JOIN `workshop_items` w ON w.`id` = s.`item_id`;
--> statement-breakpoint
-- Then one baseline row per item whose current link differs from what the downloads imply
-- (switched by hand or unlinked before this log existed).
INSERT INTO `snapshot_events` (`app_id`, `item_id`, `kind`, `from_snapshot_id`, `to_snapshot_id`, `at`)
SELECT w.`app_id`, w.`id`, 'baseline', d.`to_snapshot_id`, l.`snapshot_id`, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `workshop_items` w
LEFT JOIN `links` l ON l.`item_id` = w.`id`
LEFT JOIN `snapshot_events` d ON d.`id` = (SELECT e.`id` FROM `snapshot_events` e WHERE e.`item_id` = w.`id` ORDER BY e.`at` DESC, e.`id` DESC LIMIT 1)
WHERE d.`to_snapshot_id` IS NOT l.`snapshot_id`;
