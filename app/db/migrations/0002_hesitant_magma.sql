CREATE TABLE `task_checklist_items` (
	`id` varchar(191) NOT NULL,
	`taskId` varchar(191) NOT NULL,
	`content` varchar(500) NOT NULL,
	`completed` boolean NOT NULL DEFAULT false,
	`position` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `task_checklist_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `task_checklist_items` ADD CONSTRAINT `task_checklist_items_taskId_work_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `work_tasks`(`id`) ON DELETE cascade ON UPDATE no action;