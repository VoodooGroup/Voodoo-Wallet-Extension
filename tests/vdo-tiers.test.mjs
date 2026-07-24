import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVdoTier, formatVdoAmount } from '../src/config/vdo-tiers.js';

test('resolveVdoTier maps balance to ladder', () => {
  assert.equal(resolveVdoTier(0).tier, null);
  assert.equal(resolveVdoTier(50).tier.id, 'bronze');
  assert.equal(resolveVdoTier(1500).tier.id, 'silver');
  assert.equal(resolveVdoTier(12000).tier.id, 'gold');
  assert.equal(resolveVdoTier(60000).tier.id, 'yellowgem');
  assert.equal(resolveVdoTier(150000).tier.id, 'bluegem');
  assert.equal(resolveVdoTier(600000).tier.id, 'sapphire');
  assert.equal(resolveVdoTier(600000).next, null);
});

test('resolveVdoTier needForNext toward silver', () => {
  const r = resolveVdoTier(200);
  assert.equal(r.tier.id, 'bronze');
  assert.equal(r.next.id, 'silver');
  assert.equal(r.needForNext, 800);
});

test('formatVdoAmount is compact', () => {
  assert.equal(formatVdoAmount(500), '500');
  assert.match(formatVdoAmount(1500), /1\.5/);
});
