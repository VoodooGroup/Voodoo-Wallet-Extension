import { getAutoLockMs } from './auto-lock';

export const SESSION_KEY = 'voodoo_wallet_session_v1';
/** Unencrypted TOTP secret only while wallet is unlocked (for transfer 2FA). */
export const SESSION_TOTP_SECRET_KEY = 'voodoo_totp_session_secret_v1';

let sessionWritesEnabled = true;

function hasSessionStorage() {
  return typeof chrome !== 'undefined' && !!chrome.storage?.session;
}

export function disableSessionWrites() {
  sessionWritesEnabled = false;
}

export function enableSessionWrites() {
  sessionWritesEnabled = true;
}

export async function getSession() {
  if (!hasSessionStorage()) return null;
  const result = await chrome.storage.session.get(SESSION_KEY);
  return result[SESSION_KEY] || null;
}

export function isSessionValid(session) {
  if (!session?.vault) return false;
  return Date.now() - (session.unlockedAt || 0) < getAutoLockMs();
}

export async function saveSession(vault) {
  if (!sessionWritesEnabled || !hasSessionStorage() || !vault) return;
  await chrome.storage.session.set({
    [SESSION_KEY]: { vault, unlockedAt: Date.now() },
  });
}

export async function touchSession() {
  if (!sessionWritesEnabled || !hasSessionStorage()) return;
  const session = await getSession();
  if (!session?.vault) return;
  await chrome.storage.session.set({
    [SESSION_KEY]: { ...session, unlockedAt: Date.now() },
  });
}

export async function clearSession() {
  if (!hasSessionStorage()) return;
  await chrome.storage.session.remove([SESSION_KEY, SESSION_TOTP_SECRET_KEY]);
}

export async function setSessionTotpSecret(secret) {
  if (!sessionWritesEnabled || !hasSessionStorage()) return;
  if (!secret) {
    await chrome.storage.session.remove(SESSION_TOTP_SECRET_KEY);
    return;
  }
  await chrome.storage.session.set({ [SESSION_TOTP_SECRET_KEY]: String(secret) });
}

export async function getSessionTotpSecret() {
  if (!hasSessionStorage()) return null;
  const result = await chrome.storage.session.get(SESSION_TOTP_SECRET_KEY);
  return result[SESSION_TOTP_SECRET_KEY] || null;
}