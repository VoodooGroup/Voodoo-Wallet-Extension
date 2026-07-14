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
    this.isMetaMask = true;
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

  emit(event, ...args) {
    this._listeners.get(event)?.forEach((fn) => fn(...args));
  }

  async request({ method, params = [] }) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      const handler = (event) => {
        if (event.source !== window || event.data?.target !== 'voodoo-inpage') return;
        if (event.data.id !== id) return;
        window.removeEventListener('message', handler);
        if (event.data.error) reject(Object.assign(new Error(event.data.error.message), event.data.error));
        else resolve(event.data.result);
      };
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

  setConnected(address) {
    this.selectedAddress = address;
    this.emit('accountsChanged', address ? [address] : []);
    if (address) {
      this.emit('connect', { chainId: CHAIN_ID });
    }
  }

  disconnect() {
    this.selectedAddress = null;
    this.emit('accountsChanged', []);
    this.emit('disconnect');
  }
}

const provider = new VoodooEthereumProvider();
window.ethereum = provider;
window.dispatchEvent(new Event('ethereum#initialized'));

function announceEip6963() {
  const detail = Object.freeze({ info: EIP6963_INFO, provider });
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
}

announceEip6963();
window.addEventListener('eip6963:requestProvider', announceEip6963);

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
});