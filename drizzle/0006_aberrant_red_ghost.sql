CREATE TABLE `room_plans` (
	`room` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`room`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
