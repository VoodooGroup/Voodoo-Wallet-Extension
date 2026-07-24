import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTotpSecret,
  verifyTotpCode,
  buildTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  encryptTotpPayload,
  decryptTotpPayload,
} from '../src/lib/totp.js';

test('generateTotpSecret returns base32-like secret', () => {
  const secret = generateTotpSecret();
  assert.ok(secret.length >= 16);
  assert.match(secret, /^[A-Z2-7]+$/i);
});

test('verifyTotpCode accepts current token', () => {
  const secret = generateTotpSecret();
  const token = buildTotp({ secret }).generate();
  assert.equal(verifyTotpCode(secret, token), true);
  assert.equal(verifyTotpCode(secret, '000000'), false);
});

test('recovery codes hash consistently', async () => {
  const codes = generateRecoveryCodes(2);
  assert.equal(codes.length, 2);
  const h1 = await hashRecoveryCode(codes[0]);
  const h2 = await hashRecoveryCode(codes[0].toLowerCase());
  assert.equal(h1, h2);
  assert.notEqual(h1, await hashRecoveryCode(codes[1]));
});

test('encryptTotpPayload round-trips secret', async () => {
  const secret = generateTotpSecret();
  const encrypted = await encryptTotpPayload({ secret, version: 1 }, 'test-password-1');
  const plain = await decryptTotpPayload(encrypted, 'test-password-1');
  assert.equal(plain.secret, secret);
});
