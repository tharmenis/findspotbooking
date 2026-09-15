// Reads the local tenant/domain allowlist table (listing_domains). One
// listing's public_id can be embedded on several domains — the origin check
// for /api/* consults this list (06-express-app-structure.md).
import { prisma } from '../db/client.js';

export const tenantAllowlist = {
  listDomainsFor(publicId) {
    return prisma.listingDomain.findMany({
      where: { publicId },
      select: { domain: true },
    });
  },
};
