import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptVault, decryptVault } from '../src/lib/vault.js';

test('encryptVault and decryptVault round-trip', async () => {
  const payload = { type: 'mnemonic', secret: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' };
  const encrypted = await encryptVault(payload, 'test-password-123');
  const decrypted = await decryptVault(encrypted, 'test-password-123');
  assert.deepEqual(decrypted, payload);
});

test('decryptVault rejects wrong password', async () => {
  const encrypted = await encryptVault({ type: 'privateKey', secret: '0x123' }, 'correct-password');
  await assert.rejects(() => decryptVault(encrypted, 'wrong-password'));
});