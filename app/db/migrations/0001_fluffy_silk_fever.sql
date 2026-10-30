CREATE TABLE `app_users` (
	`id` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_users_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `work_tasks` ADD `userId` varchar(64) DEFAULT 'shella' NOT NULL;--> statement-breakpoint
CREATE INDEX `work_tasks_user_idx` ON `work_tasks` (`userId`);