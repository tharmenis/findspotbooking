// Shared stubbing for app-level tests. Overwrites the singletons the app
// imports so createApp() can run without a real DB or WordPress.
//
// The config module reads env vars at import time (top-level), and ESM
// imports are evaluated before any test hook runs — so required vars must be
// set here, before the app module graph is imported below.
process.env.WP_BASE_URL = process.env.WP_BASE_URL || 'https://findspot.test';
process.env.SYNC_SECRET = process.env.SYNC_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/findspot_booking_test';

import * as cacheModule from '../../src/services/listingsCache.js';
import * as allowlistModule from '../../src/services/tenantAllowlist.js';
import * as wpModule from '../../src/services/wordpressClient.js';

let state;

export function setupStubs() {
  state = {
    listings: new Map(),
    domains: new Map(), // publicId -> Set<string> (normalized)
    wpAvailability: null,
    wpCreate: null,
    wpStatus: null,
    wpListing: null,
    calls: { availability: [], create: [], status: [], listing: [] },
  };

  process.env.WP_BASE_URL = 'https://findspot.test';
  process.env.SYNC_SECRET = 'test-secret';
  process.env.SELF_ORIGIN = 'book.findspot.net';
  delete process.env.EXTRA_ALLOWED_ORIGINS;

  cacheModule.listingsCache.findByPublicId = async (publicId) => {
    const row = state.listings.get(publicId);
    if (!row) return null;
    return { ...row };
  };
  cacheModule.listingsCache.upsertListing = async (data) => {
    state.listings.set(data.publicId, {
      publicId: data.publicId,
      title: data.title,
      logoUrl: data.logoUrl,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail,
      enabled: data.enabled,
      blockedDates: Array.isArray(data.blockedDates) ? data.blockedDates : null,
    });
    state.domains.set(data.publicId, new Set(data.allowedDomains || []));
    return { publicId: data.publicId };
  };

  allowlistModule.tenantAllowlist.listDomainsFor = async (publicId) =>
    [...(state.domains.get(publicId) || [])].map((domain) => ({ domain }));

  wpModule.wordpressClient.getAvailability = async (publicId, date) => {
    state.calls.availability.push({ publicId, date });
    if (state.wpAvailability instanceof Error) throw state.wpAvailability;
    return state.wpAvailability || { windows: [] };
  };
  wpModule.wordpressClient.createReservation = async (payload) => {
    state.calls.create.push(payload);
    if (state.wpCreate instanceof Error) throw state.wpCreate;
    return state.wpCreate || { id: 'new-res-1' };
  };
  wpModule.wordpressClient.getReservationStatus = async (id) => {
    state.calls.status.push(id);
    if (state.wpStatus instanceof Error) throw state.wpStatus;
    return state.wpStatus || { id, status: 'pending' };
  };
  wpModule.wordpressClient.getListing = async (publicId) => {
    state.calls.listing.push(publicId);
    if (state.wpListing instanceof Error) throw state.wpListing;
    return state.wpListing || { public_id: publicId, title: 'Mock', blocked_dates: [] };
  };
}

export function getState() {
  return state;
}
