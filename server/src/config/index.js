// Central env-var access. Reads lazily (per accessor) so modules can import
// the config without requiring env vars to be set first — required values are
// validated on first read, failing fast at boot or in a test setup before any
// request is served.

const REQUIRED = ['DATABASE_URL', 'WP_BASE_URL', 'SYNC_SECRET'];

function fail(name) {
  throw new Error(`Missing required env var: ${name}`);
}

function nonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') fail(name);
  return value;
}

function int(value, name, def) {
  if (value === undefined || value === '') return def;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid ${name} (expected a non-negative integer): ${value}`);
  }
  return n;
}

function parseList(value, name) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeHostname(value) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export const config = {
  get env() {
    return process.env.NODE_ENV || 'development';
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },

  get port() {
    return int(process.env.PORT, 'PORT', 3000);
  },

  // Normalized to a bare hostname. Used by originGate for the "self-origin /
  // no check needed" standalone case.
  get selfOrigin() {

    return normalizeHostname(process.env.SELF_ORIGIN || 'book.findspot.net');
  },

  get wpBaseUrl() {
    return nonEmpty(process.env.WP_BASE_URL, 'WP_BASE_URL');
  },
  get syncSecret() {
    return nonEmpty(process.env.SYNC_SECRET, 'SYNC_SECRET');
  },

  // When truthy, the WP client short-circuits to an in-memory mock backend so
  // the full widget flow works before the WordPress plugin exists.
  get wpMockMode() {
    return process.env.WP_MOCK_MODE === 'true' || process.env.WP_MOCK_MODE === '1';
  },

  get databaseUrl() {
    return nonEmpty(process.env.DATABASE_URL, 'DATABASE_URL');
  },

  get embedAssetTtl() {
    return int(process.env.EMBED_ASSET_TTL, 'EMBED_ASSET_TTL', 300);
  },
  get bundleAssetTtl() {
    return int(process.env.BUNDLE_ASSET_TTL, 'BUNDLE_ASSET_TTL', 31536000);
  },

  get maxBodyBytes() {
    return int(process.env.MAX_BODY_BYTES, 'MAX_BODY_BYTES', 16 * 1024);
  },

  // Space-separated list of additional origins allowed to call /api/* without
  // a listing_domains row (e.g. localhost during development).
  get extraAllowedOrigins() {
    return parseList(process.env.EXTRA_ALLOWED_ORIGINS, 'EXTRA_ALLOWED_ORIGINS');
  },
};
