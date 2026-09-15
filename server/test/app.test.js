// Integration tests for the full request flow: middleware chain ordering,
// origin gating, standalone gating, sync webhook, and the standalone shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { before, after, beforeEach } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupStubs, getState } from './helpers/stubs.js';

let app;
let state;

before(async () => {
  setupStubs();
  state = getState();
  app = createApp();
});

after(() => {});

beforeEach(() => {
  state.listings.clear();
  state.domains.clear();
  state.wpAvailability = null;
  state.wpCreate = null;
  state.wpStatus = null;
  state.calls = { availability: [], create: [], status: [], listing: [] };
});

function seedListing(overrides = {}) {
  const listing = {
    publicId: 'a1b2c3',
    title: 'Taverna Test',
    logoUrl: 'https://cdn.findspot.test/logo.png',
    contactPhone: '306980081107',
    contactEmail: 'booking@taverna.test',
    enabled: true,
    blockedDates: ['2026-08-31', '2026-09-10'],
    ...overrides,
  };
  state.listings.set(listing.publicId, { ...listing });
  return listing;
}

// ---------- sync webhook ----------

test('sync upserts a listing with normalized domains', async () => {
  const res = await request(app)
    .post('/internal/listings/sync')
    .set('X-Sync-Secret', 'test-secret')
    .send({
      public_id: 'a1b2c3',
      title: 'Taverna Test',
      logo_url: 'https://cdn.findspot.test/logo.png',
      contact_phone: '306980081107',
      contact_email: 'booking@taverna.test',
      enabled: true,
      allowed_domains: ['https://client-site.com/', 'CLIENT-SITE.com', 'booking.client-site.com'],
      blocked_dates: ['2026-08-31', '2026-09-10'],
    });

  assert.equal(res.status, 204);
  const row = state.listings.get('a1b2c3');
  assert.equal(row.title, 'Taverna Test');
  assert.deepEqual([...state.domains.get('a1b2c3')], ['client-site.com', 'booking.client-site.com']);
  assert.deepEqual(row.blockedDates, ['2026-08-31', '2026-09-10']);
});

test('sync rejects malformed blocked_dates entries', async () => {
  const res = await request(app)
    .post('/internal/listings/sync')
    .set('X-Sync-Secret', 'test-secret')
    .send({
      public_id: 'bad-dates',
      title: 'X',
      blocked_dates: ['not-a-date', '2026-08-31'],
    });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'validation_error');
});

test('sync requires the sync secret', async () => {
  const res = await request(app)
    .post('/internal/listings/sync')
    .set('X-Sync-Secret', 'wrong')
    .send({ public_id: 'a1b2c3', title: 'X' });
  assert.equal(res.status, 401);
});

test('sync validates required fields', async () => {
  const res = await request(app)
    .post('/internal/listings/sync')
    .set('X-Sync-Secret', 'test-secret')
    .send({ public_id: 'a1b2c3' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'validation_error');
});

test('sync with no allowed_domains stores an empty allowlist', async () => {
  await request(app)
    .post('/internal/listings/sync')
    .set('X-Sync-Secret', 'test-secret')
    .send({ public_id: 'b2c3d4', title: 'No Embed', enabled: true });
  assert.deepEqual([...state.domains.get('b2c3d4')], []);
});

// ---------- /api/listings/:publicId ----------

test('GET /api/listings/:publicId returns cached display fields for the self origin', async () => {
  seedListing();
  const res = await request(app).get('/api/listings/a1b2c3').set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'Taverna Test');
  assert.equal(res.body.publicId, 'a1b2c3');
  assert.equal(res.body.enabled, true);
  // The default stub returns blocked_dates: []; the route's live WP call
  // populates blockedDates from the upstream response.
  assert.deepEqual(res.body.blockedDates, []);
  assert.equal(state.calls.listing[0], 'a1b2c3');
});

test('GET /api/listings/:publicId surfaces blocked_dates from WordPress', async () => {
  seedListing();
  state.wpListing = { public_id: 'a1b2c3', blocked_dates: ['2026-08-31', '2026-09-10'] };
  const res = await request(app).get('/api/listings/a1b2c3').set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.blockedDates, ['2026-08-31', '2026-09-10']);
});

test('GET /api/listings/:publicId falls back to cached blockedDates when WP is unavailable', async () => {
  seedListing({ blockedDates: ['2026-08-31'] });
  state.wpListing = Object.assign(new Error('upstream down'), { status: 502 });
  const res = await request(app).get('/api/listings/a1b2c3').set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.blockedDates, ['2026-08-31']);
});

test('GET /api/listings/:publicId returns cached branding when disabled', async () => {
  seedListing({ enabled: false });
  const res = await request(app).get('/api/listings/a1b2c3').set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 200);
  assert.equal(res.body.enabled, false);
  assert.equal(res.body.title, 'Taverna Test');
});

test('GET /api/listings/:publicId is a 404 for an unknown listing', async () => {
  const res = await request(app).get('/api/listings/nope').set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'not_found');
});

test('GET /api/listings/:publicId rejects a disallowed origin', async () => {
  seedListing();
  const res = await request(app).get('/api/listings/a1b2c3').set('Origin', 'https://evil.example.com');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'origin_not_allowed');
});

test('GET /api/listings/:publicId allows an allowlisted client origin', async () => {
  seedListing();
  state.domains.set('a1b2c3', new Set(['client-site.com']));
  const res = await request(app).get('/api/listings/a1b2c3').set('Origin', 'https://client-site.com');
  assert.equal(res.status, 200);
});

// ---------- /api/availability ----------

test('GET /api/availability returns grouped windows from WP', async () => {
  seedListing();
  state.wpAvailability = {
    windows: [{ label: 'Lunch', slots: ['12:00', '13:00'] }, { label: null, slots: ['19:00'] }],
  };
  const res = await request(app)
    .get('/api/availability?publicId=a1b2c3&date=2026-08-15')
    .set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 200);
  assert.equal(res.body.windows[0].label, 'Lunch');
  assert.deepEqual(res.body.windows[0].slots, ['12:00', '13:00']);
  assert.equal(state.calls.availability[0].date, '2026-08-15');
});

test('GET /api/availability requires a valid date', async () => {
  seedListing();
  const res = await request(app)
    .get('/api/availability?publicId=a1b2c3&date=not-a-date')
    .set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 400);
});

test('GET /api/availability rejects for a disabled listing', async () => {
  seedListing({ enabled: false });
  const res = await request(app)
    .get('/api/availability?publicId=a1b2c3&date=2026-08-15')
    .set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'listing_disabled');
});

// ---------- /api/reservations ----------

test('POST /api/reservations validates and forwards the payload', async () => {
  seedListing();
  state.wpCreate = { id: 'res-42' };
  const payload = {
    public_id: 'a1b2c3',
    arrival_date: '2026-08-15',
    arrival_hour: '13:00',
    guests: 4,
    first_name: 'Nikos',
    last_name: 'Papas',
    client_phone: '306980081107',
    client_email: 'nikos@example.com',
  };
  const res = await request(app)
    .post('/api/reservations')
    .set('Origin', 'https://book.findspot.net')
    .send(payload);
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 'res-42');
  assert.equal(state.calls.create[0].client_phone, '306980081107');
  // WordPress needs public_id to associate the reservation with the listing.
  assert.equal(state.calls.create[0].public_id, 'a1b2c3');
});

test('POST /api/reservations returns 422 on invalid payload', async () => {
  seedListing();
  const res = await request(app)
    .post('/api/reservations')
    .set('Origin', 'https://book.findspot.net')
    .send({ public_id: 'a1b2c3' });
  assert.equal(res.status, 422);
  assert.ok(res.body.error.details.length > 0);
});

test('POST /api/reservations propagates a clean 409 when the slot is taken', async () => {
  seedListing();
  const { WordPressError } = await import('../src/services/wordpressClient.js');
  state.wpCreate = new WordPressError('This time slot was just booked by someone else.', {
    status: 409,
    code: 'slot_taken',
  });
  const payload = {
    public_id: 'a1b2c3',
    arrival_date: '2026-08-15',
    arrival_hour: '13:00',
    guests: 2,
    first_name: 'Nikos',
    last_name: 'Papas',
    client_phone: '306980081107',
    client_email: 'nikos@example.com',
  };
  const res = await request(app)
    .post('/api/reservations')
    .set('Origin', 'https://book.findspot.net')
    .send(payload);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'slot_taken');
});

test('POST /api/reservations rejects for a disabled listing', async () => {
  seedListing({ enabled: false });
  const res = await request(app)
    .post('/api/reservations')
    .set('Origin', 'https://book.findspot.net')
    .send({ public_id: 'a1b2c3' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'listing_disabled');
});

test('GET /api/reservations/:id returns status from WP', async () => {
  seedListing();
  state.wpStatus = { id: 'res-42', status: 'confirmed' };
  const res = await request(app)
    .get('/api/reservations/res-42?publicId=a1b2c3')
    .set('Origin', 'https://book.findspot.net');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'confirmed');
});

// ---------- standalone shell ----------

test('GET /:publicId renders the shell with escaped title and state', async () => {
  seedListing({ title: 'Taverna <script>alert(1)</script>' });
  const res = await request(app).get('/a1b2c3');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('data-state="enabled"'));
  assert.ok(res.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!res.text.includes('<script>alert(1)</script>'));
});

test('GET /:publicId renders the not-found shell for unknown ids', async () => {
  const res = await request(app).get('/doesnotexist');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('data-state="not-found"'));
  assert.ok(res.text.includes('Listing not found'));
});

test('GET /:publicId renders the disabled state', async () => {
  seedListing({ enabled: false });
  const res = await request(app).get('/a1b2c3');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('data-state="disabled"'));
});

test('GET /embed.js serves the loader with a short cache TTL', async () => {
  const res = await request(app).get('/embed.js');
  assert.equal(res.status, 200);
  assert.match(res.text, /attachShadow/);
  assert.match(res.headers['cache-control'], /max-age=\d+/);
  assert.ok(!res.headers['cache-control'].includes('immutable'));
});

test('GET /assets/og-default.png 404s cleanly before the catch-all', async () => {
  // og-default.png is referenced by the shell but doesn't exist yet in the
  // build output — it should 404, not be treated as a listing lookup.
  const res = await request(app).get('/assets/og-default.png');
  assert.equal(res.status, 404);
});
