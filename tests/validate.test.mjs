import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress, isValidAddress } from '../src/lib/validate.js';

test('normalizeAddress accepts checksummed address', () => {
  const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  assert.equal(normalizeAddress(addr), addr);
});

test('normalizeAddress rejects invalid input', () => {
  assert.equal(normalizeAddress('not-an-address'), null);
  assert.equal(normalizeAddress(''), null);
});

test('isValidAddress mirrors normalizeAddress', () => {
  assert.equal(isValidAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'), true);
  assert.equal(isValidAddress('0xbad'), false);
});