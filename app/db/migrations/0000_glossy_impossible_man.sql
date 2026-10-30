CREATE TABLE `work_tasks` (
	`id` varchar(191) NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text NOT NULL,
	`project` varchar(255) NOT NULL,
	`status` enum('todo','doing','done') NOT NULL DEFAULT 'todo',
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`startDate` varchar(10) NOT NULL,
	`dueDate` varchar(10) NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`parentId` varchar(191),
	`sourceUrl` text,
	`createdAt` bigint NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_work_logs` (
	`id` varchar(191) NOT NULL,
	`taskId` varchar(191) NOT NULL,
	`date` varchar(10) NOT NULL,
	`content` text NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`status` enum('todo','doing','done') NOT NULL DEFAULT 'todo',
	`createdAt` bigint NOT NULL,
	CONSTRAINT `task_work_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personal_workspace` (
	`id` varchar(64) NOT NULL,
	`initialized` boolean NOT NULL DEFAULT false,
	`legacyMigrated` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_workspace_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `task_work_logs` ADD CONSTRAINT `task_work_logs_taskId_work_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `work_tasks`(`id`) ON DELETE cascade ON UPDATE no action;