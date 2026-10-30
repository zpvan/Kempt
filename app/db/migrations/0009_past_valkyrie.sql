CREATE TABLE `assistant_actions` (
	`id` varchar(191) NOT NULL,
	`messageId` varchar(191),
	`ownerUnionId` varchar(255) NOT NULL,
	`action` varchar(40) NOT NULL,
	`payload` text NOT NULL,
	`summary` varchar(500) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`createdAt` bigint NOT NULL,
	`decidedAt` bigint,
	CONSTRAINT `assistant_actions_id` PRIMARY KEY(`id`)
);
