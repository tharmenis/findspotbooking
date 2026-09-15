-- CreateTable
CREATE TABLE `listings` (
    `public_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `logo_url` VARCHAR(500) NULL,
    `contact_phone` VARCHAR(20) NULL,
    `contact_email` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`public_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `listing_domains` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(36) NOT NULL,
    `domain` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `listing_domains_public_id_idx`(`public_id`),
    UNIQUE INDEX `listing_domains_public_id_domain_key`(`public_id`, `domain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `listing_domains` ADD CONSTRAINT `listing_domains_public_id_fkey` FOREIGN KEY (`public_id`) REFERENCES `listings`(`public_id`) ON DELETE CASCADE ON UPDATE CASCADE;
