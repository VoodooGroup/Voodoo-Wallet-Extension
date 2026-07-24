import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  buildIncomingNotification,
  buildSentNotification,
  formatNotificationAmount,
  isIncomingCredit,
  resolveIncomingSender,
} from '../src/lib/incoming-notifications.js';

test('formatNotificationAmount trims trailing zeros', () => {
  assert.equal(formatNotificationAmount('50'), '50');
  assert.equal(formatNotificationAmount('50.5'), '50.5');
  assert.equal(formatNotificationAmount('0.000100'), '0.0001');
});

test('resolveIncomingSender uses real transfer from address', () => {
  const sender = '0xed4cc2ee02639e137d5e43b658bf1ad2d6cb339d';
  assert.equal(resolveIncomingSender({
    direction: 'received',
    sender,
    counterparty: sender,
  }), '0xeD4cC2ee02639E137D5e43B658BF1ad2D6cb339D');
});

test('buildIncomingNotification uses real sender from transaction', () => {
  const sender = '0xed4cc2ee02639e137d5e43b658bf1ad2d6cb339d';
  const { title, message } = buildIncomingNotification(
    {
      amount: '60',
      symbol: 'VDO',
      direction: 'received',
      status: 'success',
      sender,
      counterparty: sender,
    },
    'Account 1',
    'en',
  );
  assert.equal(title, 'You received +60 VDO from 0xeD4cC2…cb339D');
  assert.equal(message, 'Added to Account 1 · PulseChain');
  assert.doesNotMatch(title, /transaction=/);
});

test('buildSentNotification describes confirmed outbound transfer', () => {
  const { title, message } = buildSentNotification({
    amount: '25',
    symbol: 'VDO',
    to: '0xed4cc2ee02639e137d5e43b658bf1ad2d6cb339d',
    accountName: 'Account 1',
  }, 'nl');
  assert.match(title, /Verzonden/);
  assert.match(title, /25/);
  assert.match(title, /VDO/);
  assert.match(message, /Account 1/);
});

test('send success triggers background Chrome notification', () => {
  const send = readFileSync('src/popup/pages/Send.jsx', 'utf8');
  const bg = readFileSync('src/background/index.js', 'utf8');
  assert.match(send, /notifyTransferSent/);
  assert.match(bg, /NOTIFY_TRANSFER/);
  assert.match(bg, /showTransferNotification/);
});

test('incoming tx monitor polls fresh scan data on a short interval', () => {
  const incoming = readFileSync('src/background/incoming-tx.js', 'utf8');
  assert.match(incoming, /clearActivityCache/);
  assert.match(incoming, /bypassCache: true/);
  assert.match(incoming, /POLL_MINUTES = 1/);
  assert.match(incoming, /enabledAt/);
  assert.match(incoming, /pollIncomingTransactions\(\{ seedOnly: false \}\)/);
});

test('isIncomingCredit ignores sent and failed', () => {
  assert.equal(isIncomingCredit({
    direction: 'received', status: 'success', amount: '1',
  }, '0x1'), true);
  assert.equal(isIncomingCredit({
    direction: 'sent', status: 'success', amount: '1',
  }, '0x1'), false);
  assert.equal(isIncomingCredit({
    direction: 'received', status: 'failed', amount: '1',
  }, '0x1'), false);
});