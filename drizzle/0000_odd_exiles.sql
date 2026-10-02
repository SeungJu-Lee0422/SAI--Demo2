CREATE TABLE `friendships` (
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	PRIMARY KEY(`sender`, `recipient`),
	FOREIGN KEY (`sender`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `members` (
	`room` text NOT NULL,
	`profile` text NOT NULL,
	PRIMARY KEY(`room`, `profile`),
	FOREIGN KEY (`room`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`color` text DEFAULT '#3154F5' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_owner_unique` ON `profiles` (`owner`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created` text NOT NULL
);
