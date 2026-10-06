CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`name` text NOT NULL,
	`is_host` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_room_session` ON `members` (`room_id`,`session_hash`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`area` text NOT NULL,
	`radius` integer NOT NULL,
	`budget` integer NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`candidates` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`room_id` text NOT NULL,
	`member_id` text NOT NULL,
	`restaurant_id` text NOT NULL,
	`liked` integer NOT NULL,
	PRIMARY KEY(`room_id`, `member_id`, `restaurant_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
