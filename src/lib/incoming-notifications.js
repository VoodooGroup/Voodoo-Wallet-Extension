import { translate } from './i18n/index.js';
import { normalizeAddress } from './validate.js';

function shortenAddress(addr, chars = 6) {
  if (!addr) return '';
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

/** Real on-chain sender for an incoming credit (from PulseScan / RPC). */
export function resolveIncomingSender(tx) {
  const raw = tx?.sender || tx?.counterparty || '';
  return normalizeAddress(raw) || String(raw).trim();
}

function formatSenderForNotify(tx) {
  const sender = resolveIncomingSender(tx);
  if (!sender) return '—';
  return shortenAddress(sender, 6);
}

function trimTrailingZeros(value) {
  return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function formatNotificationAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const fmt = (digits) => trimTrailingZeros(
    n.toLocaleString('en-US', { maximumFractionDigits: digits }),
  );
  if (n >= 1000) return fmt(2);
  if (n >= 1) return fmt(4);
  return fmt(6);
}

export function buildIncomingNotification(tx, accountName, locale = 'en') {
  const amount = formatNotificationAmount(tx.amount);
  const symbol = tx.symbol || 'PLS';
  const from = formatSenderForNotify(tx);
  const title = translate(locale, 'notify_incoming_title', { amount, symbol, from });
  const message = translate(locale, 'notify_incoming_body', { account: accountName });
  return { title, message };
}

export function buildSentNotification(
  { amount, symbol, to, accountName },
  locale = 'en',
) {
  if (!amount || !symbol) {
    return {
      title: translate(locale, 'notify_sent_generic_title'),
      message: translate(locale, 'notify_sent_generic_body', { account: accountName || '—' }),
    };
  }
  const formatted = formatNotificationAmount(amount);
  const recipient = shortenAddress(to || '', 6) || '—';
  return {
    title: translate(locale, 'notify_sent_title', {
      amount: formatted,
      symbol,
      to: recipient,
    }),
    message: translate(locale, 'notify_sent_body', { account: accountName || '—' }),
  };
}

export function isIncomingCredit(tx, walletAddress) {
  if (!tx || tx.direction !== 'received' || tx.status === 'failed') return false;
  const amt = Number(tx.amount);
  if (!Number.isFinite(amt) || amt <= 0) return false;
  return true;
}