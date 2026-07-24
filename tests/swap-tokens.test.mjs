import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSwapTokenList,
  canQuoteSwapAmount,
  sanitizeSwapAmountInput,
} from '../src/lib/swap-tokens.js';
import { DEFAULT_TOKENS } from '../src/config/pulsechain.js';

test('buildSwapTokenList always includes PLS, VDO, POISON, MAGIC', () => {
  const list = buildSwapTokenList([], '1.5');
  const symbols = list.map((tok) => tok.symbol);
  assert.deepEqual(symbols, ['PLS', 'VDO', 'POISON', 'MAGIC']);
  assert.equal(list[0].balance, '1.5');
  assert.equal(list[0].isNative, true);
  for (const tok of list.slice(1)) {
    assert.equal(tok.balance, '0');
    assert.equal(tok.isNative, false);
  }
});

test('POISON uses 9 on-chain decimals (swap quotes break if treated as 18)', () => {
  const poison = DEFAULT_TOKENS.find((tok) => tok.symbol === 'POISON');
  assert.equal(poison.decimals, 9);
  const list = buildSwapTokenList([], '0');
  assert.equal(list.find((tok) => tok.symbol === 'POISON').decimals, 9);
  assert.equal(list.find((tok) => tok.symbol === 'MAGIC').decimals, 18);
});

test('buildSwapTokenList prefers wallet decimals for core tokens', () => {
  const poison = DEFAULT_TOKENS.find((tok) => tok.symbol === 'POISON');
  const list = buildSwapTokenList([
    { ...poison, decimals: 9, balance: '12.5', address: poison.address },
  ], '0');
  assert.equal(list.find((tok) => tok.symbol === 'POISON').decimals, 9);
  assert.equal(list.find((tok) => tok.symbol === 'POISON').balance, '12.5');
});

test('buildSwapTokenList merges wallet balances for core tokens', () => {
  const vdo = DEFAULT_TOKENS.find((tok) => tok.symbol === 'VDO');
  const list = buildSwapTokenList([
    { ...vdo, balance: '42', address: vdo.address },
  ], '0');
  const vdoEntry = list.find((tok) => tok.symbol === 'VDO');
  assert.equal(vdoEntry.balance, '42');
});

test('sanitizeSwapAmountInput normalizes comma decimals', () => {
  assert.equal(sanitizeSwapAmountInput('1,25'), '1.25');
  assert.equal(sanitizeSwapAmountInput('12..3'), '12.3');
});

test('sanitizeSwapAmountInput caps huge integer length', () => {
  const huge = '9'.repeat(40);
  const out = sanitizeSwapAmountInput(huge);
  assert.equal(out.length, 18);
  assert.equal(out, '9'.repeat(18));
});

test('formatSwapUiAmount stays compact for huge values', async () => {
  const { formatSwapUiAmount } = await import('../src/lib/swap-tokens.js');
  const huge = formatSwapUiAmount('123456789012345');
  assert.ok(huge.length <= 16, `expected compact output, got: ${huge}`);
  assert.ok(!huge.includes('123456789012345'));
});

test('canQuoteSwapAmount accepts valid pay amounts', () => {
  assert.equal(canQuoteSwapAmount('0'), false);
  assert.equal(canQuoteSwapAmount('1'), true);
  assert.equal(canQuoteSwapAmount('1.5'), true);
  assert.equal(canQuoteSwapAmount('.'), false);
});

test('buildSwapTokenList appends custom tokens after core list', () => {
  const custom = {
    address: '0xabcabcabcabcabcabcabcabcabcabcabcabc',
    symbol: 'CUSTOM',
    name: 'Custom',
    decimals: 18,
    balance: '7',
    isCustom: true,
  };
  const list = buildSwapTokenList([custom], '0');
  assert.equal(list.length, 5);
  assert.equal(list[4].symbol, 'CUSTOM');
  assert.equal(list[4].balance, '7');
});