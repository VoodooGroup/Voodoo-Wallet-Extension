import { getPrefs, setIncomingNotifyEnabled, setPrefs } from './storage.js';
import { sendRuntimeMessage } from './runtime-message.js';

export async function resolveAccountAddresses(vault, accounts) {
  const { deriveAccountFromMnemonic, walletFromPrivateKey } = await import('./wallet.js');
  if (vault.type === 'mnemonic') {
    const list = [];
    for (const acc of accounts) {
      const w = await deriveAccountFromMnemonic(vault.secret, acc.derivationIndex);
      list.push({ id: acc.id, name: acc.name, address: w.address });
    }
    return list;
  }
  const w = walletFromPrivateKey(vault.secret);
  const acc = accounts[0] || { id: '0', name: 'Account 1' };
  return [{ id: acc.id, name: acc.name, address: w.address }];
}

export async function syncWatchedAccounts(vault, accounts) {
  if (!vault || !accounts?.length) return [];
  const resolved = await resolveAccountAddresses(vault, accounts);
  await setPrefs({ watchedAccounts: resolved });
  sendRuntimeMessage({ type: 'WALLET_SYNC_WATCH_ACCOUNTS', accounts: resolved });
  sendRuntimeMessage({ type: 'NOTIFY_POLL_NOW' });
  return resolved;
}

/** Persist notification toggle and watched addresses without shared-pref races. */
export async function persistIncomingNotifications(enabled, vault, accounts) {
  await setIncomingNotifyEnabled(enabled);
  if (enabled && vault && accounts?.length) {
    const resolved = await resolveAccountAddresses(vault, accounts);
    await setPrefs({ watchedAccounts: resolved });
    sendRuntimeMessage({ type: 'WALLET_SYNC_WATCH_ACCOUNTS', accounts: resolved });
    sendRuntimeMessage({ type: 'NOTIFY_POLL_NOW' });
    return resolved;
  }
  if (enabled) {
    sendRuntimeMessage({ type: 'NOTIFY_POLL_NOW' });
  }
  return [];
}