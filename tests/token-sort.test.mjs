import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTokenStarred,
  sortTokensForDisplay,
  toggleStarredAddress,
} from '../src/lib/token-sort.js';

const VDO = { symbol: 'VDO', address: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00' };
const MAGIC = { symbol: 'MAGIC', address: '0xd63b9d8d6e38cb7fbfdceede3ce92f97f5aea7ac' };
const CUSTOM = { symbol: 'FOO', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE' };

test('toggleStarredAddress adds and removes starred tokens', () => {
  const starred = toggleStarredAddress([], VDO.address);
  assert.deepEqual(starred, [VDO.address.toLowerCase()]);
  const removed = toggleStarredAddress(starred, VDO.address);
  assert.deepEqual(removed, []);
});

test('sortTokensForDisplay puts starred tokens first', () => {
  const sorted = sortTokensForDisplay([VDO, MAGIC, CUSTOM], [CUSTOM.address, VDO.address]);
  assert.deepEqual(sorted.map((tok) => tok.symbol), ['FOO', 'VDO', 'MAGIC']);
});

test('sortTokensForDisplay keeps unstarred order stable (no balance reshuffle)', () => {
  const sorted = sortTokensForDisplay(
    [
      { ...VDO, balance: '1' },
      { ...MAGIC, balance: '50' },
      { ...CUSTOM, balance: '3' },
    ],
    [],
  );
  assert.deepEqual(sorted.map((tok) => tok.symbol), ['VDO', 'MAGIC', 'FOO']);
});

test('isTokenStarred matches case-insensitively', () => {
  assert.equal(isTokenStarred([VDO.address.toLowerCase()], VDO.address), true);
});