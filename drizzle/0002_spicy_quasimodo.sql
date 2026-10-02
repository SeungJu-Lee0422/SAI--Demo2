CREATE TABLE `accounts` (
	`owner` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
