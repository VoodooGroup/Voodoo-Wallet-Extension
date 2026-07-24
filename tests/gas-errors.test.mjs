import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTxError, formatTxError, stripEthersErrorNoise } from '../src/lib/tx-errors.js';
import { blockerFromError } from '../src/lib/send-blocker.js';

const RAW = 'insufficient funds (transaction={ "from": "0xed4cc2ee02639e137d5e43b658bf1ad2d6cb339d", "to": "0x20c02a0bc56e3e5e580b7ccc39d8da77f6ae7b4d", "value": "0xde0b6b3a7640000" }, info={ "error": { "code": -32000, "message": "insufficient funds for gas * price + value: address 0xeD4cC2ee02639E137D5e43B658BF1ad2D6cb339D have 0 want 1000000000000000000" }, "payload": { "id": 6070, "jsonrpc": "2.0", "method": "eth_estimateGas", "params": [ { "from": "0xed4cc2ee02639e137d5e43b658bf1ad2d6cb339d", "to": "0x20c02a0bc56e3e5e580b7ccc39d8da77f6ae7b4d", "value": "0xde0b6b3a7640000" } ] } }, code=INSUFFICIENT_FUNDS, version=6.17.0)';

test('stripEthersErrorNoise removes JSON blobs', () => {
  const cleaned = stripEthersErrorNoise(RAW);
  assert.doesNotMatch(cleaned, /transaction=/);
  assert.doesNotMatch(cleaned, /payload/);
  assert.match(cleaned, /insufficient funds/i);
});

test('formatTxError turns insufficient funds RPC dump into short message', () => {
  const err = new Error(RAW);
  err.code = 'INSUFFICIENT_FUNDS';
  const msg = formatTxError(err);
  assert.doesNotMatch(msg, /transaction=/);
  assert.doesNotMatch(msg, /jsonrpc/i);
  assert.match(msg, /0\.000000/);
  assert.match(msg, /1\.000000/);
  assert.match(msg, /Not enough PLS/i);
});

test('classifyTxError detects transfer insufficient funds', () => {
  const err = new Error(RAW);
  err.code = 'INSUFFICIENT_FUNDS';
  assert.equal(classifyTxError(err).type, 'insufficient_transfer');
});

test('blockerFromError never exposes raw RPC text', () => {
  const err = new Error(RAW);
  err.code = 'INSUFFICIENT_FUNDS';
  const blocker = blockerFromError(err);
  assert.equal(blocker.reason, 'insufficient_pls');
  assert.equal(blocker.plsBalance, '0.000000');
  assert.equal(blocker.plsRequired, '1.000000');
  assert.equal(blocker.shortfallPls, '1.000000');
  assert.equal(blocker.includesGas, true);
  assert.equal(JSON.stringify(blocker).includes('transaction='), false);
});