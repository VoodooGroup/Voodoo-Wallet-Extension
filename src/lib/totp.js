import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { encryptVault, decryptVault } from './vault.js';

export const TOTP_STORAGE_KEY = 'voodoo_totp_v1';
export const TOTP_ISSUER = 'Voodoo Wallet';
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;

/** @returns {string} Base32 secret */
export function generateTotpSecret() {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

export function buildTotp({ secret, label = 'Wallet' }) {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function getTotpUri(secret, accountLabel = 'Wallet') {
  return buildTotp({ secret, label: accountLabel }).toString();
}

export async function getTotpQrDataUrl(secret, accountLabel = 'Wallet') {
  const uri = getTotpUri(secret, accountLabel);
  return QRCode.toDataURL(uri, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

/** Window ±1 step (~30s) for clock skew */
export function verifyTotpCode(secret, code) {
  const cleaned = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = buildTotp({ secret });
  const delta = totp.validate({ token: cleaned, window: 1 });
  return delta !== null;
}

export function generateRecoveryCodes(count = 8) {
  const codes = [];
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < count; i += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let s = '';
    for (let j = 0; j < 8; j += 1) {
      s += alphabet[bytes[j] % alphabet.length];
      if (j === 3) s += '-';
    }
    codes.push(s);
  }
  return codes;
}

export async function hashRecoveryCode(code) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encryptTotpPayload(payload, password) {
  return encryptVault(payload, password);
}

export async function decryptTotpPayload(encrypted, password) {
  return decryptVault(encrypted, password);
}

export async function getTotpState() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { enabled: false };
  }
  const result = await chrome.storage.local.get(TOTP_STORAGE_KEY);
  const state = result[TOTP_STORAGE_KEY];
  if (!state?.enabled || !state?.encrypted) {
    return { enabled: false };
  }
  return {
    enabled: true,
    encrypted: state.encrypted,
    recoveryHashes: Array.isArray(state.recoveryHashes) ? state.recoveryHashes : [],
  };
}

export async function isTotpEnabled() {
  const state = await getTotpState();
  return Boolean(state.enabled);
}

export async function saveTotpEnabled({ encrypted, recoveryHashes }) {
  await chrome.storage.local.set({
    [TOTP_STORAGE_KEY]: {
      enabled: true,
      encrypted,
      recoveryHashes: recoveryHashes || [],
      updatedAt: Date.now(),
    },
  });
}

export async function clearTotpState() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.remove(TOTP_STORAGE_KEY);
}

/**
 * After password change, re-encrypt TOTP blob with the new password.
 */
export async function reencryptTotpForNewPassword(oldPassword, newPassword) {
  const state = await getTotpState();
  if (!state.enabled || !state.encrypted) return;
  const payload = await decryptTotpPayload(state.encrypted, oldPassword);
  const encrypted = await encryptTotpPayload(payload, newPassword);
  await saveTotpEnabled({
    encrypted,
    recoveryHashes: state.recoveryHashes,
  });
}

export async function consumeRecoveryCode(state, code) {
  const hash = await hashRecoveryCode(code);
  const idx = (state.recoveryHashes || []).indexOf(hash);
  if (idx < 0) return null;
  const next = [...state.recoveryHashes];
  next.splice(idx, 1);
  return next;
}

/**
 * Verify a transfer 2FA code against the session secret (set at unlock)
 * or by decrypting with password. Recovery codes also accepted.
 */
export async function verifyTransferTotpCode(code, password = '') {
  const cleaned = String(code || '').trim();
  if (!cleaned) {
    const err = new Error('error_totp_required');
    err.code = 'TOTP_REQUIRED';
    throw err;
  }

  const { getSessionTotpSecret } = await import('./session.js');
  const sessionSecret = await getSessionTotpSecret();
  if (sessionSecret && verifyTotpCode(sessionSecret, cleaned)) {
    return true;
  }

  const state = await getTotpState();
  if (!state.enabled || !state.encrypted) {
    throw new Error('error_totp_not_enabled');
  }

  // Recovery code path (and password decrypt if session secret missing)
  if (password) {
    let payload;
    try {
      payload = await decryptTotpPayload(state.encrypted, password);
    } catch {
      throw new Error('error_wrong_password');
    }
    if (payload?.secret && verifyTotpCode(payload.secret, cleaned)) {
      const { setSessionTotpSecret } = await import('./session.js');
      await setSessionTotpSecret(payload.secret);
      return true;
    }
  }

  const nextHashes = await consumeRecoveryCode(state, cleaned);
  if (nextHashes) {
    await saveTotpEnabled({
      encrypted: state.encrypted,
      recoveryHashes: nextHashes,
    });
    return true;
  }

  throw new Error('error_totp_invalid');
}
