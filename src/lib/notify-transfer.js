import { sendRuntimeMessage } from './runtime-message.js';

/** Ask the background worker to show a Chrome notification for a confirmed send. */
export function notifyTransferSent({
  amount,
  symbol,
  to,
  accountName,
  hash,
}) {
  sendRuntimeMessage({
    type: 'NOTIFY_TRANSFER',
    kind: 'sent',
    amount,
    symbol,
    to,
    accountName,
    hash,
  });
}