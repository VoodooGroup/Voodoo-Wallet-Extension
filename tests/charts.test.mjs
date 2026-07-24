import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('charts.js excludes YTD and ALL ranges', () => {
  const source = readFileSync('src/lib/charts.js', 'utf8');
  assert.match(source, /id: '24H'/);
  assert.match(source, /id: '12M'/);
  assert.doesNotMatch(source, /id: 'YTD'/);
  assert.doesNotMatch(source, /id: 'ALL'/);
});

test('chart tokens include known pool addresses', async () => {
  const { CHART_TOKENS } = await import('../src/config/chart-tokens.js');
  for (const token of CHART_TOKENS) {
    assert.match(token.poolAddress, /^0x[a-f0-9]{40}$/i);
    assert.equal(token.poolAddress, token.poolAddress.toLowerCase());
    assert.ok(token.lcwCode.length > 0);
  }
});

test('charts.js prefers LiveCoinWatch and prefetches', () => {
  const source = readFileSync('src/lib/charts.js', 'utf8');
  assert.match(source, /fetchLiveCoinWatchChart/);
  assert.match(source, /hasLcwApiKey/);
  assert.match(source, /prefetchTokenCharts/);
  assert.match(source, /getCachedTokenChart/);
});