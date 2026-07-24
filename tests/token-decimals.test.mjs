import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTokenDecimalsCache,
  healCustomTokensDecimals,
  normalizeDecimals,
  isNativeSwapToken,
} from '../src/lib/token-decimals.js';
import { DEFAULT_TOKENS } from '../src/config/pulsechain.js';

test('normalizeDecimals clamps invalid values', () => {
  assert.equal(normalizeDecimals(9), 9);
  assert.equal(normalizeDecimals(18), 18);
  assert.equal(normalizeDecimals(0), 0); // valid for some tokens
  assert.equal(normalizeDecimals(undefined), 18);
  assert.equal(normalizeDecimals(null), 18);
  assert.equal(normalizeDecimals(''), 18);
  assert.equal(normalizeDecimals(-1), 18);
  assert.equal(normalizeDecimals(99), 18);
  assert.equal(normalizeDecimals(6.7), 6);
  assert.equal(normalizeDecimals(NaN, 8), 8);
});

test('isNativeSwapToken detects PLS', () => {
  assert.equal(isNativeSwapToken({ isNative: true, symbol: 'PLS' }), true);
  assert.equal(isNativeSwapToken({ symbol: 'PLS' }), true);
  assert.equal(isNativeSwapToken({ symbol: 'POISON', address: '0xabc' }), false);
});

test('POISON config decimals stay 9 (regression guard)', () => {
  const poison = DEFAULT_TOKENS.find((t) => t.symbol === 'POISON');
  assert.equal(poison.decimals, 9);
});

test('healCustomTokensDecimals fixes wrong stored decimals', () => {
  clearTokenDecimalsCache();
  const addr = '0xb8c8761fed2aad5c0a75561bc604531a42c452e6';
  const customs = [{
    address: addr,
    symbol: 'POISON',
    name: 'POISON',
    decimals: 18, // wrong
    isCustom: true,
  }];
  const balances = [{
    address: addr,
    symbol: 'POISON',
    name: 'POISON Reward Token',
    decimals: 9,
    balance: '1',
  }];
  const healed = healCustomTokensDecimals(customs, balances);
  assert.ok(healed);
  assert.equal(healed[0].decimals, 9);
  assert.equal(healed[0].symbol, 'POISON');
});

test('healCustomTokensDecimals returns null when already correct', () => {
  const addr = '0xabcabcabcabcabcabcabcabcabcabcabcabcabcd';
  const customs = [{ address: addr, symbol: 'FOO', name: 'FOO', decimals: 6 }];
  const balances = [{ address: addr, symbol: 'FOO', name: 'FOO', decimals: 6 }];
  assert.equal(healCustomTokensDecimals(customs, balances), null);
});

test('healCustomTokensDecimals leaves unrelated tokens alone', () => {
  const customs = [
    { address: '0x1111111111111111111111111111111111111111', symbol: 'A', decimals: 18 },
  ];
  const balances = [
    { address: '0x2222222222222222222222222222222222222222', symbol: 'B', decimals: 9 },
  ];
  assert.equal(healCustomTokensDecimals(customs, balances), null);
});
