import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostname } from '../src/lib/normalizeHostname.js';

test('strips scheme', () => {
  assert.equal(normalizeHostname('https://client-site.com'), 'client-site.com');
  assert.equal(normalizeHostname('http://client-site.com'), 'client-site.com');
});

test('strips trailing slash and path', () => {
  assert.equal(normalizeHostname('https://client-site.com/'), 'client-site.com');
  assert.equal(normalizeHostname('https://client-site.com/booking'), 'client-site.com');
});

test('lowercases', () => {
  assert.equal(normalizeHostname('https://Client-Site.com'), 'client-site.com');
});

test('drops credentials', () => {
  assert.equal(normalizeHostname('https://user:pass@client-site.com'), 'client-site.com');
});

test('strips standard ports, keeps non-standard', () => {
  assert.equal(normalizeHostname('https://client-site.com:443'), 'client-site.com');
  assert.equal(normalizeHostname('https://client-site.com:80'), 'client-site.com');
  assert.equal(normalizeHostname('https://client-site.com:8443'), 'client-site.com:8443');
});

test('handles garbage input without throwing', () => {
  assert.equal(normalizeHostname(''), '');
  assert.equal(normalizeHostname(null), '');
  assert.equal(normalizeHostname(undefined), '');
  assert.equal(normalizeHostname('   '), '');
});
