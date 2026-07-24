import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateStakeRewards,
  formatCalcAmount,
  poolCalcLabel,
} from '../src/lib/stake-calculator.js';

test('estimateStakeRewards matches website formula (daily compound over lock)', () => {
  // Website: apyDecimal=1.2 (120%), amount=1000, 30 days
  // dailyRate = 1.2/365, years=30/365, total = amt*(1+r)^(365*y) - amt
  const est = estimateStakeRewards({ amount: 1000, apyPercent: 120, lockupDays: 30 });
  assert.ok(est);
  const dailyRate = 1.2 / 365;
  const expectedTotal = 1000 * ((1 + dailyRate) ** 30) - 1000;
  const expectedDaily = 1000 * dailyRate;
  assert.ok(Math.abs(est.totalReward - expectedTotal) < 1e-9);
  assert.ok(Math.abs(est.dailyReward - expectedDaily) < 1e-9);
});

test('estimateStakeRewards rejects invalid input', () => {
  assert.equal(estimateStakeRewards({ amount: 0, apyPercent: 10, lockupDays: 30 }), null);
  assert.equal(estimateStakeRewards({ amount: 100, apyPercent: -1, lockupDays: 30 }), null);
  assert.equal(estimateStakeRewards({ amount: 100, apyPercent: 10, lockupDays: 0 }), null);
});

test('poolCalcLabel is compact wallet style', () => {
  const label = poolCalcLabel({
    rewardLabel: 'MAGIC',
    lockupDays: 30,
    apy: 120,
  });
  assert.equal(label, 'MAGIC · 30d · 120% APY');
});

test('formatCalcAmount uses fixed decimals like website', () => {
  assert.equal(formatCalcAmount(12.3456789, 4), '12.3457');
  assert.equal(formatCalcAmount(0.123456789, 6), '0.123457');
});
