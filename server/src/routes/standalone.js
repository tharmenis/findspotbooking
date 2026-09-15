// GET /:publicId — standalone HTML shell with server-injected OG meta tags
// (04-widget-embedding.md). Registered LAST so static/api paths win.
//
// The public_id is constrained to a safe character set and length; anything
// else falls through to Express's 404 (it isn't a listing lookup attempt).
//
// Missing and disabled listings both render intentionally — a shared link to
// a broken/paused listing should look deliberately unavailable, not 404.
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listingsCache } from '../services/listingsCache.js';
import { escapeHtml } from '../lib/escapeHtml.js';
import { logger } from '../lib/logger.js';

const router = Router();

const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{1,36}$/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'standalone-shell.html');

// Read once at boot; the shell is static apart from the two placeholders.
const SHELL = readFileSync(TEMPLATE_PATH, 'utf8');

const NOT_FOUND_TITLE = 'Listing not found';
const DISABLED_TITLE = 'Booking currently unavailable';

router.get('/:publicId', async (req, res, next) => {
  const { publicId } = req.params;
  if (!PUBLIC_ID_RE.test(publicId)) return next();

  let listing;
  try {
    listing = await listingsCache.findByPublicId(publicId);
  } catch (err) {
    return next(err);
  }

  const title = listing ? listing.title : NOT_FOUND_TITLE;
  const description = listing
    ? `Book a table at ${listing.title} online.`
    : 'This listing is not available for online booking.';
  const pageTitle = listing ? `Findspot booking engine – ${title}` : 'Findspot booking engine – Listing not found';

  let html = SHELL
    .replace('{{listing_title}}', escapeHtml(pageTitle))
    .replace('{{listing_description}}', escapeHtml(description))
    .replace('{{og_url}}', escapeHtml(`https://book.findspot.net/${publicId}`))
    .replace('{{public_id}}', escapeHtml(publicId))
    .replace('{{listing_state}}', listing ? (listing.enabled ? 'enabled' : 'disabled') : 'not-found');

  logger.debug('served standalone shell', { publicId, state: listing ? (listing.enabled ? 'enabled' : 'disabled') : 'not-found' });
  res.send(html);
});

export default router;
export { NOT_FOUND_TITLE, DISABLED_TITLE };
