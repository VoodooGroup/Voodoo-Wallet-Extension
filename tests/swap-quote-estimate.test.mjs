import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateSwapInput,
  estimateSwapOutput,
  formatSwapEstimateOut,
  swapPriceSymbol,
  wplsPerTokenFromPair,
} from '../src/lib/swap-quote-estimate.js';

const PLS = { key: 'PLS', symbol: 'PLS', isNative: true };
const VDO = {
  key: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00',
  symbol: 'VDO',
  address: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00',
  isNative: false,
};
const VDO_ADDR = VDO.address.toLowerCase();
const CUSTOM = {
  key: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  symbol: 'SHIB',
  address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  isNative: false,
  isCustom: true,
};
const CUSTOM_ADDR = CUSTOM.address.toLowerCase();

test('swapPriceSymbol maps native PLS', () => {
  assert.equal(swapPriceSymbol(PLS), 'PLS');
  assert.equal(swapPriceSymbol(VDO), 'VDO');
});

test('estimateSwapOutput uses fiat prices without wallet balance', () => {
  const estimate = estimateSwapOutput('1000', PLS, VDO, { PLS: 0.00003, VDO: 0.0012 });
  assert.ok(estimate);
  assert.equal(estimate.isEstimate, true);
  assert.equal(Number(estimate.amountOutFormatted), 25);
});

test('estimateSwapOutput uses dex WPLS rates when available', () => {
  const estimate = estimateSwapOutput('1000', PLS, VDO, {}, { pls: 1, [VDO_ADDR]: 40 });
  assert.ok(estimate);
  assert.equal(estimate.source, 'dex');
  assert.equal(Number(estimate.amountOutFormatted), 25);
});

test('wplsPerTokenFromPair supports token as quote side', () => {
  const pair = {
    chainId: 'pulsechain',
    priceNative: 1000,
    baseToken: { symbol: 'WPLS', address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' },
    quoteToken: { symbol: 'FOO', address: CUSTOM.address },
  };
  assert.equal(wplsPerTokenFromPair(pair, CUSTOM.address), 0.001);
});

test('estimateSwapOutput works for custom tokens with address-keyed dex rates', () => {
  const dexRates = { pls: 1, [VDO_ADDR]: 40, [CUSTOM_ADDR]: 0.01 };
  const estimate = estimateSwapOutput('1000', PLS, CUSTOM, {}, dexRates);
  assert.ok(estimate);
  assert.equal(estimate.source, 'dex');
  assert.equal(Number(estimate.amountOutFormatted), 100000);
});

test('formatSwapEstimateOut keeps small values readable', () => {
  assert.match(formatSwapEstimateOut(0.00000012), /^1\.2.*e-7$/);
});

test('estimateSwapInput reverses fiat estimate (exact-out)', () => {
  const estimate = estimateSwapInput('25', PLS, VDO, { PLS: 0.00003, VDO: 0.0012 });
  assert.ok(estimate);
  assert.equal(Number(estimate.amountInFormatted), 1000);
});