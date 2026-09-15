// Thin fetch wrapper around the WP plugin's custom REST endpoints. All
// WP base URL, error normalization, and 409 mapping lives here, not in the
// route handlers (06-express-app-structure.md).
//
// The actual route paths (per 05-open-items.md) are registered by the WP
// plugin under /wp-json/findspot/v1/.
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { mockWordPress } from './mockWordPress.js';

const WP_TIMEOUT_MS = 10000;

class WordPressError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'WordPressError';
    this.status = status;
    this.code = code;
  }
}

// When WP_MOCK_MODE is on, short-circuit to the in-memory mock before any
// network call. Rejections are wrapped in WordPressError so the error
// handler behaves identically in both modes.
function wrapMockError(err) {
  if (err instanceof WordPressError) return err;
  return new WordPressError(err.message || 'Mock request failed.', {
    status: err.status || 500,
    code: err.code,
  });
}

function wpUrl(route, params) {
  const base = config.wpBaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}/wp-json/findspot/v1/${route}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request(route, { params, method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(wpUrl(route, params), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(WP_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error('wordpressClient request failed', { route, error: err.message });
    throw new WordPressError('Could not reach the booking provider.', { status: 502 });
  }

  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      // non-JSON error body — fall through to generic mapping
    }

    const wpError = data && data.data ? data.data : null;
    const code = wpError && wpError.code ? wpError.code : null;
    const status = (wpError && wpError.status) || res.status;

    // 409 with WP_Error code 'slot_taken' is the business outcome "slot just
    // got booked" — must stay distinguishable from transport failures, since
    // the widget branches its UI on it (06-express-app-structure.md).
    if (res.status === 409) {
      throw new WordPressError(
        data && data.message ? data.message : 'This time slot was just booked by someone else.',
        { status: 409, code: code || 'slot_taken' }
      );
    }

    if (status >= 500) {
      logger.error('wordpressClient upstream error', { route, status, error: data });
      throw new WordPressError('The booking provider is temporarily unavailable.', { status: 502 });
    }

    const message = data && data.message ? data.message : `WordPress returned ${res.status}.`;
    throw new WordPressError(message, { status, code });
  }

  if (res.status === 204) return null;
  return res.json();
}

export const wordpressClient = {
  getAvailability(publicId, date) {
    if (config.wpMockMode) {
      return mockWordPress.getAvailability(publicId, date).catch((err) => {
        throw wrapMockError(err);
      });
    }
    // The WP plugin identifies listings by public_id (not an internal numeric
    // listing_id) — the Express cache is keyed on publicId and there is no
    // separate internal id to resolve. Availability is a single-day query.
    return request('availability', { params: { public_id: publicId, date } });
  },

  createReservation(payload) {
    if (config.wpMockMode) {
      return mockWordPress.createReservation(payload).catch((err) => {
        throw wrapMockError(err);
      });
    }
    return request('reservations', { method: 'POST', body: payload });
  },

  getReservationStatus(id) {
    if (config.wpMockMode) {
      return mockWordPress.getReservationStatus(id).catch((err) => {
        throw wrapMockError(err);
      });
    }
    return request(`reservations/${encodeURIComponent(id)}`);
  },

  // Live fetch of the listing payload (including blocked_dates) from WP.
  // The Express cache stores only display fields; blocked_dates lives only
  // in WordPress and is fetched on demand.
  getListing(publicId) {
    if (config.wpMockMode) {
      return mockWordPress.getListing(publicId).catch((err) => {
        throw wrapMockError(err);
      });
    }
    return request(`listings/${encodeURIComponent(publicId)}`);
  },
};

export { WordPressError };
