import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  buildGasSpending,
  buildRecentYields,
  buildUpcomingUnlocks,
  calcTxGasFee,
} from '../src/lib/wallet-insights-core.js';

test('buildUpcomingUnlocks sorts ready stakes first', () => {
  const now = 1_000_000;
  const rows = buildUpcomingUnlocks([
    {
      index: 0,
      amount: '10',
      stakeTime: now - 100,
      lockDuration: 200,
      rewardType: 0,
      isStaked: true,
      unlockAt: now + 100,
    },
    {
      index: 1,
      amount: '5',
      stakeTime: now - 500,
      lockDuration: 100,
      rewardType: 1,
      isStaked: true,
      unlockAt: now - 10,
    },
  ], now);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].ready, true);
  assert.equal(rows[1].ready, false);
});

test('buildGasSpending totals outgoing tx fees', () => {
  const wallet = '0xabc';
  const summary = buildGasSpending([
    {
      hash: '0x1',
      from: wallet,
      gasUsed: '21000',
      gasPrice: '1000000000',
      timeStamp: '100',
      txreceipt_status: '1',
    },
    {
      hash: '0x2',
      from: '0xother',
      gasUsed: '21000',
      gasPrice: '1000000000',
      timeStamp: '200',
      txreceipt_status: '1',
    },
  ], wallet);

  assert.equal(summary.txCount, 1);
  assert.equal(calcTxGasFee({ gasUsed: '21000', gasPrice: '1000000000' }), 21000000000000n);
});

test('buildRecentYields filters incoming MAGIC and POISON', () => {
  const wallet = '0xabc';
  const rows = buildRecentYields([
    {
      hash: '0x1',
      to: wallet,
      from: '0xstaking',
      tokenSymbol: 'MAGIC',
      value: '1000000000000000000',
      tokenDecimal: '18',
      timeStamp: '50',
      logIndex: '1',
    },
    {
      hash: '0x2',
      to: wallet,
      from: '0xother',
      tokenSymbol: 'VDO',
      value: '1',
      tokenDecimal: '18',
      timeStamp: '60',
      logIndex: '2',
    },
  ], wallet);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, 'MAGIC');
});

test('hamburger menu exposes wallet insight entries', () => {
  const menu = readFileSync('src/popup/components/HeaderMenu.jsx', 'utf8');
  assert.match(menu, /menu_upcoming_unlocks/);
  assert.match(menu, /menu_gas_spending/);
  assert.match(menu, /menu_recent_yields/);
});