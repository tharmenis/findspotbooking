-- Migration: convert listings.title from VARCHAR to JSON array of {language_code, title}
-- This migration wraps existing string titles as English entries.

SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE `listings` ADD COLUMN `title_json` JSON NULL;

UPDATE `listings`
SET `title_json` = JSON_ARRAY(JSON_OBJECT('language_code','en','title', `title`))
WHERE `title` IS NOT NULL;

ALTER TABLE `listings` DROP COLUMN `title`;

ALTER TABLE `listings` CHANGE `title_json` `title` JSON NOT NULL;

SET FOREIGN_KEY_CHECKS=1;
