import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/lib/escapeHtml.js';

test('escapes HTML metacharacters', () => {
  assert.equal(
    escapeHtml(`<script>alert("xss & co")</script>'`),
    '&lt;script&gt;alert(&quot;xss &amp; co&quot;)&lt;/script&gt;&#39;'
  );
});

test('passes through safe strings', () => {
  assert.equal(escapeHtml('Café de la Ville'), 'Café de la Ville');
});

test('coerces null/undefined to empty string', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
