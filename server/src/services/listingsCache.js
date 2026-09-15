// Reads/writes the local `listings` table via Prisma. WordPress is the only
// writer of this data (via /internal/listings/sync); these functions keep the
// Prisma calls in one place.
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';

const DISPLAY_FIELDS = {
  publicId: true,
  title: true,
  logoUrl: true,
  contactPhone: true,
  contactEmail: true,
  enabled: true,
  blockedDates: true,
};

export const listingsCache = {
  findByPublicId(publicId) {
    return prisma.listing.findUnique({
      where: { publicId },
      select: DISPLAY_FIELDS,
    });
  },

  // Full replace, not merge: delete existing domain rows for this public_id
  // and insert the incoming set. WP is the source of truth for the domain
  // list, so there's no Express-side add/remove logic (06-express-app-structure.md).
  // The @@unique([publicId, domain]) constraint makes a retried sync safe.
  async upsertListing({ publicId, title, logoUrl, contactPhone, contactEmail, enabled, blockedDates, allowedDomains = [] }) {
    if (!Array.isArray(allowedDomains)) {
      throw new TypeError('allowedDomains must be an array');
    }

    await prisma.$transaction(async (tx) => {
      await tx.listing.upsert({
        where: { publicId },
        update: { title, logoUrl, contactPhone, contactEmail, enabled, blockedDates },
        create: { publicId, title, logoUrl, contactPhone, contactEmail, enabled, blockedDates },
      });

      await tx.listingDomain.deleteMany({ where: { publicId } });
      if (allowedDomains.length > 0) {
        await tx.listingDomain.createMany({
          data: allowedDomains.map((domain) => ({ publicId, domain })),
          skipDuplicates: true,
        });
      }
    });

    logger.debug('listing upserted', { publicId, domainCount: allowedDomains.length });
    return { publicId };
  },
};

export { DISPLAY_FIELDS };
