// GET /api/listings/:publicId — cached display fields. Runs the full
// middleware chain; the listing row is already attached by resolvePublicId.
// Unlike availability/reservations this route is allowed to respond while the
// listing is disabled, returning cached branding for the "temporarily
// unavailable" UI state (04-widget-embedding.md).
//
// blocked_dates is live-fetched from WordPress on every request — the source
// of truth lives in WP. If WP is unreachable, fall back to the cached value
// (legacy sync field) so a transient WP outage doesn't break the widget.
//
// Cross-origin logoUrl is rewritten to /api/listings/:publicId/logo so the
// widget loads it from the BFF (same-origin). The browser's HTTPS-Only mode
// would otherwise upgrade http:// WP URLs to https://, which fails for LAMP
// servers without a real cert.
import { Router } from 'express';
import { resolvePublicId } from '../../middleware/resolvePublicId.js';
import { originGate } from '../../middleware/originGate.js';
import { wordpressClient } from '../../services/wordpressClient.js';
import { logger } from '../../lib/logger.js';

const router = Router();

function logoProxyPath(publicId) {
  return `/api/listings/${encodeURIComponent(publicId)}/logo`;
}

router.get('/:publicId', resolvePublicId, originGate, async (req, res) => {
  const { listing } = req;
  const cachedBlocked = Array.isArray(listing.blockedDates) ? listing.blockedDates : [];

  let blockedDates = cachedBlocked;
  try {
    const wpListing = await wordpressClient.getListing(listing.publicId);
    if (wpListing && Array.isArray(wpListing.blocked_dates)) {
      blockedDates = wpListing.blocked_dates;
    }
  } catch (err) {
    // WP unreachable / returned an error. Surface the cached value (or []) so
    // the widget still renders; log so we can investigate the upstream issue.
    logger.warn('wordpressClient.getListing failed; serving cached blocked_dates', {
      publicId: listing.publicId,
      error: err && err.message,
    });
  }

  // Rewrite a cross-origin logoUrl to the BFF proxy. Same-origin (rare) is
  // left untouched. The widget always loads <img> from the BFF origin so the
  // browser never upgrades http:// → https:// for the LAMP WP host.
  let logoUrl = listing.logoUrl;
  if (logoUrl) {
    try {
      const parsed = new URL(logoUrl);
      const sameOrigin =
        parsed.host === req.headers.host ||
        (parsed.protocol === 'https:' && parsed.host === `www.${req.headers.host}`);
      if (!sameOrigin) {
        logoUrl = logoProxyPath(listing.publicId);
      }
    } catch {
      // Unparseable URL — leave it alone; <img> will fail naturally.
    }
  }

  res.json({
    publicId: listing.publicId,
    title: listing.title,
    logoUrl,
    contactPhone: listing.contactPhone,
    contactEmail: listing.contactEmail,
    blockedDates,
    enabled: listing.enabled,
  });
});

// Streams the listing's logo from WordPress to the browser. Lets the widget
// load the image from the BFF origin (no mixed content, no https-upgrade).
router.get('/:publicId/logo', resolvePublicId, originGate, async (req, res, next) => {
  const logoUrl = req.listing.logoUrl;
  if (!logoUrl) {
    return res.status(404).end();
  }

  // Don't recurse through this route if the logoUrl somehow points back to it.
  if (logoUrl.startsWith(logoProxyPath(req.listing.publicId))) {
    return res.status(404).end();
  }

  try {
    const upstream = await fetch(logoUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      return res.status(502).end();
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    // Stream the body to the client without buffering the whole image in memory.
    const reader = upstream.body.getReader();
    res.on('close', () => reader.cancel().catch(() => {}));
    const pump = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
    };
    await pump();
  } catch (err) {
    next(err);
  }
});

export default router;
