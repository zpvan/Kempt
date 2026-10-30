ALTER TABLE `app_users` DROP INDEX `app_users_name_unique`;--> statement-breakpoint
ALTER TABLE `app_users` ADD `ownerUnionId` varchar(255);