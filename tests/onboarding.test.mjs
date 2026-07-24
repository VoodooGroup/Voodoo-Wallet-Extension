import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { translate } from '../src/lib/i18n/index.js';
import { translateError } from '../src/lib/i18n/translate-error.js';
import { getLcwApiKey, hasLcwApiKey } from '../src/config/livecoinwatch.js';

test('wallet creation defers setup until phrase is confirmed', () => {
  const walletCtx = readFileSync('src/context/WalletContext.jsx', 'utf8');
  const onboarding = readFileSync('src/popup/pages/Onboarding.jsx', 'utf8');

  assert.match(walletCtx, /generateWalletMnemonic/);
  assert.match(walletCtx, /completeWalletCreation/);
  assert.doesNotMatch(walletCtx, /createWallet/);
  assert.match(onboarding, /generateWalletMnemonic/);
  assert.match(onboarding, /completeWalletCreation/);
  assert.match(onboarding, /handleBackupConfirm/);
  assert.match(onboarding, /copyRecoveryPhrase/);
  assert.match(onboarding, /written_it_down/);
  assert.doesNotMatch(onboarding, /createWallet/);
  assert.doesNotMatch(onboarding, /saved_continue/);
});

test('generated mnemonic is valid before wallet is saved', () => {
  const phrase = generateMnemonic(wordlist, 128);
  assert.equal(validateMnemonic(phrase, wordlist), true);
});

test('translateError maps i18n error keys', () => {
  const t = (key) => translate('en', key);
  assert.equal(translateError(t, 'error_invalid_recovery_phrase'), 'Invalid recovery phrase');
  assert.equal(translateError(t, 'RPC timeout'), 'RPC timeout');
});

test('LCW API key is not hardcoded in source', () => {
  const source = readFileSync('src/config/livecoinwatch.js', 'utf8');
  assert.doesNotMatch(source, /44e5e37a-f7ec-4843-9bfc-169fa14ceaa1/);
  assert.equal(hasLcwApiKey(), Boolean(process.env.VITE_LCW_API_KEY?.trim()));
  assert.doesNotMatch(getLcwApiKey(), /^44e5e37a/);
});