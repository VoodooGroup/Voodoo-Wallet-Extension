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
} from './dapp.js';

chrome.runtime.onInstalled.addListener(() => {
  refreshActionBadge();
});

chrome.runtime.onStartup.addListener(() => {
  refreshActionBadge();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'DAPP_REQUEST':
        await handleDappRequest(message, _sender.tab?.id);
        sendResponse({ ok: true });
        break;
      case 'WALLET_SET_ACTIVE':
        await setActiveAddress(message.address);
        sendResponse({ ok: true });
        break;
      case 'DAPP_GET_PENDING':
        sendResponse(await getPendingDapp());
        break;
      case 'DAPP_GET_CONNECTIONS':
        sendResponse({ origins: await getConnectedOrigins() });
        break;
      case 'DAPP_DISCONNECT':
        await disconnectOrigin(message.origin);
        sendResponse({ ok: true });
        break;
      case 'DAPP_APPROVE_CONNECT':
        await approveConnect(message.origin);
        sendResponse({ ok: true });
        break;
      case 'DAPP_REJECT_CONNECT':
        await rejectConnect();
        sendResponse({ ok: true });
        break;
      case 'DAPP_APPROVE_SIGN':
        await approveSign(message.result);
        sendResponse({ ok: true });
        break;
      case 'DAPP_REJECT_SIGN':
        await rejectSign();
        sendResponse({ ok: true });
        break;
      default:
        break;
    }
  })();
  return true;
});