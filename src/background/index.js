import {
  handleDappRequest,
  setActiveAddress,
  approveConnect,
  rejectConnect,
  approveSign,
  rejectSign,
  getPendingDapp,
  getConnectedOrigins,
  disconnectOrigin,
  refreshActionBadge,
  takeReply,
  getDappDebug,
} from './dapp.js';
import { getIncomingNotifyEnabled } from '../lib/storage.js';
import {
  clearIncomingNotificationState,
  initIncomingTxMonitor,
  pollIncomingTransactions,
  setIncomingNotificationsEnabled,
} from './incoming-tx.js';
import {
  clearPriceAlertState,
  initPriceAlertMonitor,
  pollPriceAlerts,
  setPriceAlertsEnabled,
} from './price-alerts.js';
import { showTransferNotification } from './transfer-notify.js';

initIncomingTxMonitor();
initPriceAlertMonitor();

chrome.runtime.onInstalled.addListener(() => {
  refreshActionBadge();
});

chrome.runtime.onStartup.addListener(() => {
  refreshActionBadge();
});

function createResponder(sendResponse) {
  let settled = false;
  return (payload) => {
    if (settled) return;
    settled = true;
    try {
      sendResponse(payload);
    } catch {
      /* receiver context may have closed */
    }
  };
}

const HANDLED_MESSAGE_TYPES = new Set([
  'DAPP_REQUEST',
  'DAPP_POLL_RESPONSE',
  'DAPP_DEBUG',
  'WALLET_SET_ACTIVE',
  'DAPP_GET_PENDING',
  'DAPP_GET_CONNECTIONS',
  'DAPP_DISCONNECT',
  'DAPP_APPROVE_CONNECT',
  'DAPP_REJECT_CONNECT',
  'DAPP_APPROVE_SIGN',
  'DAPP_REJECT_SIGN',
  'NOTIFY_SET_ENABLED',
  'NOTIFY_POLL_NOW',
  'NOTIFY_TRANSFER',
  'WALLET_SYNC_WATCH_ACCOUNTS',
  'NOTIFY_WALLET_RESET',
  'PRICE_ALERT_SET_ENABLED',
  'PRICE_ALERT_POLL_NOW',
]);

async function handleRuntimeMessage(message, sender) {
  switch (message.type) {
    case 'DAPP_REQUEST': {
      // Return immediate payload on the message channel (most reliable for unlocked wallet)
      const result = await handleDappRequest(message, sender.tab?.id);
      return result ?? { ok: true };
    }
    case 'DAPP_POLL_RESPONSE': {
      const payload = await takeReply(message.id);
      return payload
        ? { found: true, payload }
        : { found: false };
    }
    case 'DAPP_DEBUG':
      return getDappDebug();
    case 'WALLET_SET_ACTIVE':
      await setActiveAddress(message.address);
      return { ok: true };
    case 'DAPP_GET_PENDING':
      return getPendingDapp();
    case 'DAPP_GET_CONNECTIONS':
      return { origins: await getConnectedOrigins() };
    case 'DAPP_DISCONNECT':
      await disconnectOrigin(message.origin);
      return { ok: true };
    case 'DAPP_APPROVE_CONNECT': {
      // Optional address from account picker in DappPrompt
      const result = await approveConnect(message.origin, message.address || null);
      return result?.ok === false ? result : { ok: true, ...result };
    }
    case 'DAPP_REJECT_CONNECT':
      await rejectConnect({ closeWindow: message.closeWindow !== false });
      return { ok: true };
    case 'DAPP_APPROVE_SIGN':
      await approveSign(message.result);
      return { ok: true };
    case 'DAPP_REJECT_SIGN':
      await rejectSign({ closeWindow: message.closeWindow !== false });
      return { ok: true };
    case 'NOTIFY_SET_ENABLED':
      await setIncomingNotificationsEnabled(Boolean(message.enabled));
      return { ok: true };
    case 'NOTIFY_POLL_NOW':
      return pollIncomingTransactions();
    case 'NOTIFY_TRANSFER':
      return showTransferNotification(message);
    case 'WALLET_SYNC_WATCH_ACCOUNTS':
      if (await getIncomingNotifyEnabled()) {
        await pollIncomingTransactions();
      }
      return { ok: true };
    case 'NOTIFY_WALLET_RESET':
      await clearIncomingNotificationState();
      await clearPriceAlertState();
      return { ok: true };
    case 'PRICE_ALERT_SET_ENABLED':
      await setPriceAlertsEnabled(Boolean(message.enabled));
      return { ok: true };
    case 'PRICE_ALERT_POLL_NOW':
      return pollPriceAlerts();
    default:
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!HANDLED_MESSAGE_TYPES.has(message?.type)) {
    return false;
  }

  const respond = createResponder(sendResponse);

  (async () => {
    try {
      const result = await handleRuntimeMessage(message, sender);
      respond(result ?? { ok: true });
    } catch (err) {
      respond({ ok: false, error: err?.message || String(err) });
    }
  })();

  return true;
});
