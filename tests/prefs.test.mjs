import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('setPrefs is serialized to prevent lost updates', () => {
  const source = readFileSync('src/lib/storage.js', 'utf8');
  assert.match(source, /prefsWriteChain/);
  assert.match(source, /prefsWriteChain = prefsWriteChain\.then/);
});

test('incoming notifications use isolated storage key', () => {
  const storage = readFileSync('src/lib/storage.js', 'utf8');
  const watch = readFileSync('src/lib/watch-accounts.js', 'utf8');
  assert.match(storage, /INCOMING_NOTIFY_KEY/);
  assert.match(storage, /setIncomingNotifyEnabled/);
  assert.match(watch, /setIncomingNotifyEnabled\(enabled\)/);
  assert.doesNotMatch(watch, /incomingNotifications: true, watchedAccounts/);
});

test('incoming notifications pref lives in WalletContext (survives Settings tab unmount)', () => {
  const walletCtx = readFileSync('src/context/WalletContext.jsx', 'utf8');
  const settings = readFileSync('src/popup/pages/Settings.jsx', 'utf8');
  assert.match(walletCtx, /incomingNotifications/);
  assert.match(walletCtx, /setIncomingNotificationsEnabled/);
  assert.match(walletCtx, /INCOMING_NOTIFY_KEY/);
  assert.doesNotMatch(settings, /useState\(false\).*incomingNotifications/);
  assert.doesNotMatch(settings, /getPrefs/);
  assert.doesNotMatch(settings, /refreshIncomingNotificationsPref/);
});

test('syncWatchedAccounts does not touch notification toggle', () => {
  const source = readFileSync('src/lib/watch-accounts.js', 'utf8');
  assert.match(source, /setPrefs\(\{ watchedAccounts: resolved \}\)/);
  assert.doesNotMatch(source, /incomingNotifications/);
});

test('incoming notifications toggle guards against storage listener races', () => {
  const source = readFileSync('src/context/WalletContext.jsx', 'utf8');
  assert.match(source, /incomingNotifyPersistingRef/);
  assert.match(source, /getIncomingNotifyEnabled/);
});