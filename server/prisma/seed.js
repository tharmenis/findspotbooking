// Prisma seed — inserts mock listing rows into the local cache so the
// standalone page and /api/* routes work during development without a live
// WordPress push.
//
// Safe to re-run: uses upserts keyed on public_id and replaces the domain
// list each time (same full-replace semantics as the sync webhook).
//
// Run with: npx prisma db seed
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MOCK_LISTINGS = [
  {
    publicId: 'test123',
    title: 'Taverna Test',
    logoUrl: 'https://placehold.co/200x200/1a73e8/ffffff?text=T',
    contactPhone: '306980081107',
    contactEmail: 'booking@taverna-test.gr',
    enabled: true,
    allowedDomains: ['localhost', '127.0.0.1'],
  },
  {
    publicId: 'el-demo',
    title: 'Καφέ Ορίζοντας',
    logoUrl: 'https://placehold.co/200x200/0f766e/ffffff?text=K',
    contactPhone: '306911234567',
    contactEmail: 'info@kafe-orizontas.gr',
    enabled: true,
    allowedDomains: ['localhost', '127.0.0.1'],
  },
  {
    publicId: 'disabled-demo',
    title: 'Sole Mio (paused)',
    logoUrl: null,
    contactPhone: '390212345678',
    contactEmail: 'ciao@sole-mio.it',
    enabled: false,
    allowedDomains: [],
  },
];

async function main() {
  for (const listing of MOCK_LISTINGS) {
    await prisma.$transaction(async (tx) => {
      await tx.listing.upsert({
        where: { publicId: listing.publicId },
        update: {
          title: listing.title,
          logoUrl: listing.logoUrl,
          contactPhone: listing.contactPhone,
          contactEmail: listing.contactEmail,
          enabled: listing.enabled,
        },
        create: {
          publicId: listing.publicId,
          title: listing.title,
          logoUrl: listing.logoUrl,
          contactPhone: listing.contactPhone,
          contactEmail: listing.contactEmail,
          enabled: listing.enabled,
        },
      });

      await tx.listingDomain.deleteMany({ where: { publicId: listing.publicId } });
      if (listing.allowedDomains.length > 0) {
        await tx.listingDomain.createMany({
          data: listing.allowedDomains.map((domain) => ({
            publicId: listing.publicId,
            domain,
          })),
          skipDuplicates: true,
        });
      }
    });
    console.log(`Seeded ${listing.publicId} (${listing.title}, enabled=${listing.enabled})`);
  }

  const total = await prisma.listing.count();
  console.log(`\nDone — ${total} listing(s) in the cache.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
