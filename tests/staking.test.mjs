import test from 'node:test';
import assert from 'node:assert/strict';
import { STAKING_POOLS } from '../src/config/staking.js';

test('staking pools include MAGIC and POISON variants', () => {
  const magic = STAKING_POOLS.filter((p) => p.rewardLabel === 'MAGIC');
  const poison = STAKING_POOLS.filter((p) => p.rewardLabel === 'POISON');
  assert.equal(magic.length, 3);
  assert.equal(poison.length, 3);
  assert.ok(STAKING_POOLS.every((p) => p.duration > 0 && p.lockupDays > 0));
});