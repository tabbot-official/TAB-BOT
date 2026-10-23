import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, searchLinks } from '../src/services/numberLookup.js';
test('parses indian numbers with and without +91', () => {
  const a = parseNumber('+91 98765 43210'); const b = parseNumber('9876543210');
  assert.equal(a.e164, '+919876543210'); assert.equal(b.e164, a.e164);
  assert.equal(a.country, 'IN'); assert.equal(a.valid, true); assert.equal(a.type, 'Mobile');
});
test('rejects junk, flags invalid', () => {
  assert.equal(parseNumber('abc'), null); assert.equal(parseNumber('12'), null);
  assert.equal(parseNumber('+91 12345').valid, false);
});
test('links', () => { assert.ok(searchLinks('+919876543210').length >= 4); });
