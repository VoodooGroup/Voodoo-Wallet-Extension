const CHAIN_ID = '0x171';
const EIP6963_INFO = {
  uuid: '6f3d2a1b-9c4e-4f8a-b2d1-7e5c9a3b8f01',
  name: 'Voodoo Wallet',
  icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="%23037dd6"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-family="Arial">V</text></svg>',
  rdns: 'app.voodoowallet',
};

class VoodooEthereumProvider {
  constructor() {
    this.isVoodooWallet = true;
    this.isMetaMask = true; // legacy dApp flag only
    this._listeners = new Map();
    this.selectedAddress = null;
    this.chainId = CHAIN_ID;
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return this;
  }

  removeListener(event, fn) {
    this._listeners.get(event)?.delete(fn);
    return this;
  }

  off(event, fn) {
    return this.removeListener(event, fn);
  }

  emit(event, ...args) {
    this._listeners.get(event)?.forEach((fn) => {
      try { fn(...args); } catch { /* ignore */ }
    });
  }

  async request({ method, params = [] }) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const isConnect = method === 'eth_requestAccounts' || method === 'wallet_requestPermissions';
    const timeoutMs = isConnect ? 90000 : 25000;

    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', handler);
        clearTimeout(timer);
        clearInterval(pollTimer);
        fn(value);
      };

      const handler = (event) => {
        if (event.source !== window || event.data?.target !== 'voodoo-inpage') return;
        if (event.data.id !== id) return;
        // Accept any message with our id (type optional)
        if (event.data.error) {
          const err = new Error(event.data.error.message || 'Wallet request failed');
          err.code = event.data.error.code;
          finish(reject, err);
        } else if ('result' in event.data || event.data.type === 'VOODOO_DAPP_RESPONSE') {
          const result = event.data.result;
          if (Array.isArray(result) && result[0]) {
            this.selectedAddress = result[0];
          }
          finish(resolve, result);
        }
      };

      const pollTimer = setInterval(() => {
        window.postMessage({
          target: 'voodoo-contentscript',
          type: 'VOODOO_POLL_RESPONSE',
          id,
        }, '*');
      }, 400);

      const timer = setTimeout(() => {
        finish(reject, Object.assign(
          new Error(
            'TIMEOUT (90s): Wallet gaf geen antwoord.\n'
            + '1) Open Voodoo Wallet en log IN\n'
            + '2) chrome://extensions → Reload\n'
            + '3) Deze pagina Ctrl+F5\n'
            + '4) Opnieuw verbinden',
          ),
          { code: 'VOODOO_TIMEOUT' },
        ));
      }, timeoutMs);

      window.addEventListener('message', handler);
      window.postMessage({
        target: 'voodoo-contentscript',
        type: 'VOODOO_DAPP_REQUEST',
        id,
        method,
        params,
      }, '*');
    });
  }

  async send(methodOrPayload, paramsOrCallback) {
    if (typeof methodOrPayload === 'string') {
      return this.request({ method: methodOrPayload, params: paramsOrCallback || [] });
    }
    const payload = methodOrPayload || {};
    const result = await this.request({
      method: payload.method,
      params: payload.params || [],
    });
    if (typeof paramsOrCallback === 'function') {
      paramsOrCallback(null, { id: payload.id, jsonrpc: '2.0', result });
      return undefined;
    }
    return result;
  }

  sendAsync(payload, callback) {
    this.request({ method: payload.method, params: payload.params || [] })
      .then((result) => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
      .catch((error) => callback(error, null));
  }

  setConnected(address) {
    this.selectedAddress = address;
    this.emit('accountsChanged', address ? [address] : []);
    if (address) this.emit('connect', { chainId: CHAIN_ID });
  }

  disconnect() {
    this.selectedAddress = null;
    this.emit('accountsChanged', []);
    this.emit('disconnect');
  }

  enable() {
    return this.request({ method: 'eth_requestAccounts' });
  }
}

const provider = new VoodooEthereumProvider();
window.voodooEthereum = provider;
window.VoodooWalletProvider = provider;

function announceEip6963() {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({ info: EIP6963_INFO, provider }),
  }));
}

function attachToWindowEthereum() {
  if (!window.ethereum) {
    window.ethereum = provider;
    return;
  }
  const eth = window.ethereum;
  if (eth === provider || eth.isVoodooWallet) {
    window.ethereum = provider;
    return;
  }
  try {
    if (Array.isArray(eth.providers)) {
      if (!eth.providers.includes(provider)) eth.providers.push(provider);
    } else {
      eth.providers = [eth, provider];
    }
  } catch { /* frozen */ }
}

attachToWindowEthereum();
announceEip6963();
window.dispatchEvent(new Event('ethereum#initialized'));
window.addEventListener('eip6963:requestProvider', announceEip6963);
setTimeout(() => { attachToWindowEthereum(); announceEip6963(); }, 0);
setTimeout(() => { attachToWindowEthereum(); announceEip6963(); }, 500);
setTimeout(() => { attachToWindowEthereum(); announceEip6963(); }, 1500);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.target !== 'voodoo-inpage') return;
  if (event.data.type === 'VOODOO_ACCOUNTS_CHANGED') {
    const address = event.data.accounts?.[0] || null;
    if (address) provider.setConnected(address);
    else provider.disconnect();
  }
  if (event.data.type === 'VOODOO_CHAIN_CHANGED') {
    provider.chainId = event.data.chainId;
    provider.emit('chainChanged', event.data.chainId);
  }
  if (event.data.type === 'VOODOO_BRIDGE_READY') {
    window.__VOODOO_BRIDGE_READY__ = true;
    window.__VOODOO_EXTENSION_ID__ = event.data.extensionId || null;
  }
});
