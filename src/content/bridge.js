import providerPath from '../inpage/provider.js?script';

function injectProvider() {
  if (document.documentElement.dataset.voodooInjected) return;
  document.documentElement.dataset.voodooInjected = 'true';

  const path = providerPath.replace(/^\//, '');
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(path);
  (document.head || document.documentElement).prepend(script);
}

injectProvider();

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'VOODOO_DAPP_RESPONSE') {
    window.postMessage({ target: 'voodoo-inpage', ...message }, '*');
  }
  if (message.type === 'VOODOO_ACCOUNTS_BROADCAST') {
    window.postMessage({
      target: 'voodoo-inpage',
      type: 'VOODOO_ACCOUNTS_CHANGED',
      accounts: message.accounts,
    }, '*');
  }
});

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.target !== 'voodoo-contentscript') return;
  if (event.data.type !== 'VOODOO_DAPP_REQUEST') return;

  chrome.runtime.sendMessage({
    type: 'DAPP_REQUEST',
    id: event.data.id,
    method: event.data.method,
    params: event.data.params,
    origin: window.location.origin,
    hostname: window.location.hostname,
  });
});