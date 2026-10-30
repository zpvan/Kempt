CREATE TABLE `assistant_messages` (
	`id` varchar(191) NOT NULL,
	`ownerUnionId` varchar(255) NOT NULL,
	`workspaceId` varchar(64) NOT NULL,
	`modelId` varchar(64),
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `assistant_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assistant_models` (
	`id` varchar(64) NOT NULL,
	`ownerUnionId` varchar(255) NOT NULL,
	`provider` enum('kimi','minimax') NOT NULL,
	`name` varchar(100) NOT NULL,
	`baseUrl` text NOT NULL,
	`model` varchar(200) NOT NULL,
	`apiKeyCiphertext` text NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistant_models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `assistant_messages_conversation_idx` ON `assistant_messages` (`ownerUnionId`,`workspaceId`);--> statement-breakpoint
CREATE INDEX `assistant_models_owner_idx` ON `assistant_models` (`ownerUnionId`);