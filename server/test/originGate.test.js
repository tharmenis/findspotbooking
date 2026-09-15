import test from 'node:test';
import assert from 'node:assert/strict';

// The config module reads env vars at import time; set them before importing.
process.env.WP_BASE_URL = process.env.WP_BASE_URL || 'https://findspot.test';
process.env.SYNC_SECRET = process.env.SYNC_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/findspot_booking_test';

import { originGate } from '../src/middleware/originGate.js';
import * as allowlistModule from '../src/services/tenantAllowlist.js';

// Fake req/res for middleware unit testing.
function fakeReq(overrides) {
  const headers = {};
  return {
    get: (name) => headers[name.toLowerCase()],
    listing: { publicId: 'abc123' },
    ...overrides,
  };
}

function fakeRes() {
  const res = { statusCode: 200 };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test('allows requests with no Origin header (same-origin standalone)', async () => {
  const req = fakeReq({ get: () => undefined });
  const res = fakeRes();
  let calledNext = false;
  await originGate(req, res, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
  assert.equal(res.statusCode, 200);
});

test('allows requests from the self origin', async () => {
  const req = fakeReq({ get: () => 'https://book.findspot.net' });
  const res = fakeRes();
  let calledNext = false;
  await originGate(req, res, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
});

test('allows an origin that matches a registered allowlisted domain', async () => {
  allowlistModule.tenantAllowlist.listDomainsFor = async () => [{ domain: 'https://client-site.com/' }];
  const req = fakeReq({ get: () => 'https://client-site.com' });
  const res = fakeRes();
  let calledNext = false;
  await originGate(req, res, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
});

test('rejects an origin that is not allowlisted', async () => {
  allowlistModule.tenantAllowlist.listDomainsFor = async () => [{ domain: 'client-site.com' }];
  const req = fakeReq({ get: () => 'https://evil.example.com' });
  const res = fakeRes();
  await originGate(req, res, () => {
    throw new Error('next should not be called');
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'origin_not_allowed');
});

test('rejects with 403 even when the allowlist is empty', async () => {
  allowlistModule.tenantAllowlist.listDomainsFor = async () => [];
  const req = fakeReq({ get: () => 'https://not-allowlisted.com' });
  const res = fakeRes();
  await originGate(req, res, () => {
    throw new Error('next should not be called');
  });
  assert.equal(res.statusCode, 403);
});

test('allows origins configured via EXTRA_ALLOWED_ORIGINS (dev)', async () => {
  process.env.EXTRA_ALLOWED_ORIGINS = 'http://localhost:5173';
  allowlistModule.tenantAllowlist.listDomainsFor = async () => [];
  const req = fakeReq({ get: () => 'http://localhost:5173' });
  const res = fakeRes();
  let calledNext = false;
  await originGate(req, res, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
});

test('handles allowlist lookup errors by calling next(err)', async () => {
  allowlistModule.tenantAllowlist.listDomainsFor = async () => {
    throw new Error('db down');
  };
  const req = fakeReq({ get: () => 'https://client-site.com' });
  const res = fakeRes();
  let caught;
  await originGate(req, res, (err) => {
    caught = err;
  });
  assert.ok(caught instanceof Error);
  assert.equal(caught.message, 'db down');
});
