import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('tx detail uses RPC first and treats PulseScan errors as optional', () => {
  const source = readFileSync('src/lib/tx-detail.js', 'utf8');
  assert.match(source, /provider\.getTransaction\(hash\)/);
  assert.match(source, /provider\.getTransactionReceipt\(hash\)/);
  assert.doesNotMatch(source, /PulseScan unavailable/);
  assert.match(source, /if \(!res\.ok\) return null/);
  assert.match(source, /txDetailCache/);
  assert.match(source, /resolveTimestamp/);
  assert.match(source, /SCAN_ENRICH_BUDGET_MS/);
  assert.match(source, /startScanEnrichment/);
  assert.match(source, /prefetchContractName/);
  assert.match(source, /cachedContractName\(toAddress\)/);
});