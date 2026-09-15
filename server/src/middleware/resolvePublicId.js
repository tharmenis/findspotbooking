// Middleware 1 of the /api/* chain: resolve the public_id against the local
// listings cache (never a live WP call). Attaches the row to req.listing.
// No row at all => genuine 404 ("never set up for standalone booking"),
// distinct from a row that exists but is disabled.
//
// The publicId can arrive three ways depending on the route contract:
//   - /api/listings/:publicId        -> req.params.publicId
//   - GET /api/availability?publicId -> req.params (normalized by the route)
//   - POST /api/reservations         -> req.body.public_id
import { listingsCache } from '../services/listingsCache.js';

export async function resolvePublicId(req, res, next) {
  const publicId = req.params.publicId || (req.body && req.body.public_id);

  if (!publicId) {
    return res.status(400).json({ error: { code: 'missing_public_id', message: 'Missing publicId.' } });
  }

  let listing;
  try {
    listing = await listingsCache.findByPublicId(publicId);
  } catch (err) {
    return next(err);
  }

  if (!listing) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'This listing is not set up for standalone booking.' },
    });
  }

  req.listing = listing;
  next();
}
