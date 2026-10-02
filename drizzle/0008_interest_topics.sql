CREATE TABLE `interest_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`canonical_key` text NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `profiles`(`owner`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interest_topics_owner_canonical_unique` ON `interest_topics` (`owner`,`canonical_key`);
