// Widget API client. All calls go to the BFF (/api/*), which handles tenant
// origin enforcement, caching and WP proxying. The widget never talks to
// WordPress directly.
//
// Base URL resolution (read at request time, not module load):
//   - window.FINDSPOT_API_BASE, when set — the standalone entry point sets
//     this to the current origin (same-origin API calls, and local development
//     against a local server works).
//   - otherwise the production BFF, https://book.findspot.net (embed mode on
//     client sites, where relative URLs would hit the client's own server).
function getApiBase() {
  return (
    (typeof window !== 'undefined' && window.FINDSPOT_API_BASE) ||
    'https://book.findspot.net'
  );
}

export async function request(path, options = {}) {
  // Split headers out of options so we can merge them with the BFF's default
  // Accept header instead of letting `...options` clobber the computed headers
  // (which previously dropped Accept on POST requests).
  const { headers, ...rest } = options;
  const res = await fetch(`${getApiBase()}${path}`, {
    ...rest,
    headers: { Accept: 'application/json', ...headers },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export function getListing(publicId) {
  return request(`/api/listings/${encodeURIComponent(publicId)}`);
}

export function getAvailability(publicId, date) {
  const params = new URLSearchParams({ publicId, date });
  return request(`/api/availability?${params}`);
}

// The widget sends an already-concatenated phone string: country calling code
// + national number, digits only, no '+' (03-reservation-form-ui.md).
export function createReservation(payload) {
  
  return request('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
