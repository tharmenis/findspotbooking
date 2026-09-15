// Middleware 2 of the /api/* chain — a single unified origin check for both
// embed and standalone modes (06-express-app-structure.md):
//   - Origin absent (same-origin page load) or matching the self origin
//     (book.findspot.net) => allow, no tenant lookup needed.
//   - Otherwise the Origin must match a registered domain for this listing's
//     public_id in listing_domains; mismatch => clear, console-visible 403.
// Comparison is hostname-only on both sides, so scheme / trailing-slash
// differences between WP's stored domains and the browser's Origin header
// don't cause false mismatches.
import { config } from '../config/index.js';
import { normalizeHostname } from '../lib/normalizeHostname.js';
import { tenantAllowlist } from '../services/tenantAllowlist.js';

const REJECT = {
  error: {
    code: 'origin_not_allowed',
    message: 'This origin is not allowed to book for this listing.',
  },
};

export async function originGate(req, res, next) {
  const origin = req.get('origin');

  // Same-origin standalone page load: no Origin header, or our own domain.
  if (!origin) return next();
  if (normalizeHostname(origin) === config.selfOrigin) return next();

  const configured = config.extraAllowedOrigins.map(normalizeHostname);
  if (configured.includes(normalizeHostname(origin))) return next();

  let domains;
  try {
    domains = await tenantAllowlist.listDomainsFor(req.listing.publicId);
  } catch (err) {
    return next(err);
  }

  const allowed = domains.map((row) => normalizeHostname(row.domain));
  if (allowed.includes(normalizeHostname(origin))) return next();

  req.log && req.log.warn({ origin, publicId: req.listing.publicId }, 'blocked request from disallowed origin');
  return res.status(403).json(REJECT);
}
