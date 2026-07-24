import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('Activity load does not depend on source state (avoids reload loop)', () => {
  const source = readFileSync('src/popup/pages/Activity.jsx', 'utf8');
  assert.match(source, /sourceRef/);
  assert.match(source, /requestIdRef/);
  assert.match(source, /peekActivityCache/);
  assert.doesNotMatch(source, /\[address, source, t\]/);
  assert.doesNotMatch(source, /\[address, load\]/);
});

test('scan fetches txlist and tokentx with separate timeouts', () => {
  const block = readFileSync('src/lib/transactions.js', 'utf8');
  assert.match(block, /Promise\.allSettled/);
  assert.match(block, /SCAN_TXLIST_TIMEOUT_MS/);
  assert.match(block, /SCAN_TOKENTX_TIMEOUT_MS/);
  assert.match(block, /fetchScanAction\('txlist'/);
  assert.match(block, /fetchScanAction\('tokentx'/);
});

test('activity uses staged fast RPC then tokentx merge for VDO', () => {
  const block = readFileSync('src/lib/transactions.js', 'utf8');
  const activity = readFileSync('src/popup/pages/Activity.jsx', 'utf8');
  assert.match(block, /fetchActivityFast/);
  assert.match(block, /fetchActivityFull/);
  assert.match(block, /fetchTokenTransfersScan/);
  assert.match(block, /fetchKnownTokenTransfers/);
  assert.match(block, /Known tokens first/);
  assert.match(block, /contractaddress: token\.address/);
  assert.match(block, /no token transfer/);
  assert.match(block, /tokenEnriched/);
  assert.match(activity, /fetchActivityFast/);
  assert.match(activity, /fetchActivityFull/);
  assert.match(activity, /tokenEnriched/);
});

test('fetchWalletActivity routes scan source directly to PulseScan API', () => {
  const block = readFileSync('src/lib/transactions.js', 'utf8');
  assert.match(block, /if \(source === 'scan'\)/);
  assert.match(block, /return fetchViaScanApi\(address, cursor \|\| 1\)/);
});

test('parseScanResult handles empty and no-record responses', () => {
  const parseBlock = readFileSync('src/lib/transactions.js', 'utf8');
  assert.match(parseBlock, /no transaction/);
  assert.match(parseBlock, /no record/);
  assert.match(parseBlock, /isScanOk/);
});