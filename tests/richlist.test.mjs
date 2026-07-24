import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TOKENS } from '../src/config/pulsechain.js';

test('VDO token is configured for richlist', () => {
  const vdo = DEFAULT_TOKENS.find((t) => t.symbol === 'VDO');
  assert.ok(vdo);
  assert.match(vdo.address, /^0x[a-fA-F0-9]{40}$/);
  assert.equal(vdo.decimals, 18);
});
