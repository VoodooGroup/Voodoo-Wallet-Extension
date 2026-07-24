import providerPath from '../inpage/provider.js?script';

function injectProvider() {
  if (document.documentElement?.dataset?.voodooInjected === 'true') return;
  if (document.documentElement) {
    document.documentElement.dataset.voodooInjected = 'true';
  }

  const path = String(providerPath || '').replace(/^\//, '');
  if (!path) return;

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(path);
  script.async = false;
  script.onload = () => {
    script.remove();
    forwardToPage({
      type: 'VOODOO_BRIDGE_READY',
      extensionId: chrome.runtime.id,
    });
  };
  script.onerror = () => {
    console.error('[Voodoo] provider inject failed', path);
    if (document.documentElement) {
      delete document.documentElement.dataset.voodooInjected;
    }
  };
  (document.head || document.documentElement).prepend(script);
}

function forwardToPage(message) {
  try {
    window.postMessage({ target: 'voodoo-inpage', ...message }, '*');
  } catch (e) {
    console.warn('[Voodoo] postMessage failed', e);
  }
}

function forwardDappResponse(payload) {
  if (!payload || !payload.id) return;
  // Ensure type for page handler — only include error when present
  const msg = {
    type: 'VOODOO_DAPP_RESPONSE',
    id: payload.id,
    result: payload.result ?? null,
    ts: payload.ts || Date.now(),
  };
  if (payload.error != null) {
    msg.error = payload.error;
  }
  forwardToPage(msg);
}

injectProvider();
setTimeout(injectProvider, 50);
setTimeout(injectProvider, 400);

// Background → page
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'VOODOO_DAPP_RESPONSE' || message.id) {
    if (message.type === 'VOODOO_DAPP_RESPONSE' || message.result !== undefined || message.error) {
      forwardDappResponse(message);
      sendResponse?.({ ok: true });
      return true;
    }
  }
  if (message.type === 'VOODOO_ACCOUNTS_BROADCAST') {
    forwardToPage({
      type: 'VOODOO_ACCOUNTS_CHANGED',
      accounts: message.accounts,
    });
    sendResponse?.({ ok: true });
    return true;
  }
  return undefined;
});

// Storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.lastDappResponse?.newValue) {
    forwardDappResponse(changes.lastDappResponse.newValue);
  }
});

// Page → background
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.target !== 'voodoo-contentscript') {
    return;
  }

  // Poll for a specific request id
  if (event.data.type === 'VOODOO_POLL_RESPONSE') {
    const reqId = event.data.id;
    chrome.runtime.sendMessage({ type: 'DAPP_POLL_RESPONSE', id: reqId }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.found && res.payload) {
        forwardDappResponse(res.payload);
      }
    });
    return;
  }

  if (event.data.type === 'VOODOO_DEBUG') {
    chrome.runtime.sendMessage({ type: 'DAPP_DEBUG' }, (res) => {
      forwardToPage({
        type: 'VOODOO_DEBUG_RESULT',
        debug: res || { error: chrome.runtime.lastError?.message },
      });
    });
    return;
  }

  if (event.data.type !== 'VOODOO_DAPP_REQUEST') return;

  const requestId = event.data.id;

  chrome.runtime.sendMessage({
    type: 'DAPP_REQUEST',
    id: requestId,
    method: event.data.method,
    params: event.data.params || [],
    origin: window.location.origin,
    hostname: window.location.hostname,
  }, (response) => {
    const errMsg = chrome.runtime.lastError?.message;
    if (errMsg) {
      console.warn('[Voodoo] DAPP_REQUEST failed', errMsg);
      forwardDappResponse({
        id: requestId,
        result: null,
        error: {
          code: -32603,
          message:
            'Voodoo Wallet extensie reageert niet. Reload de extensie op chrome://extensions en druk Ctrl+F5 op deze pagina. ('
            + errMsg
            + ')',
        },
      });
      return;
    }

    // Immediate result (unlocked wallet) — deliver right away on this channel
    if (response?.immediate && response.payload) {
      forwardDappResponse(response.payload);
      return;
    }

    // Pending user action (connect / approve / stake / sign):
    // Poll FOREVER — never timeout-reject. User may open the extension much later.
    // A TIMEOUT popup when they ignore the wallet is ugly UX.
    if (response?.pending) {
      const timer = setInterval(() => {
        chrome.runtime.sendMessage({ type: 'DAPP_POLL_RESPONSE', id: requestId }, (res) => {
          if (chrome.runtime.lastError) return;
          if (res?.found && res.payload) {
            clearInterval(timer);
            forwardDappResponse(res.payload);
          }
        });
      }, 500);
    }
  });
});
