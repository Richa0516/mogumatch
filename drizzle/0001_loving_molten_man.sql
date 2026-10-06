CREATE TABLE `create_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_limits_expiry` ON `create_limits` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_rooms_created` ON `rooms` (`created_at`);