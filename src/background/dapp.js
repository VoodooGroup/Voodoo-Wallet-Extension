import { JsonRpcProvider } from 'ethers';
import { PULSECHAIN_RPC_URLS } from '../config/rpc.js';
import {
  isReadOnlyRpcMethod,
  isUnsupportedChainSwitch,
  PULSECHAIN_CHAIN_ID,
  PULSECHAIN_CHAIN_ID_HEX,
  requestsAccountPermission,
} from '../lib/dapp-methods.js';

/** Cached JsonRpcProviders per URL (ethers v6 FallbackProvider has no .send()). */
const rpcByUrl = new Map();

function getJsonRpc(url) {
  let p = rpcByUrl.get(url);
  if (!p) {
    p = new JsonRpcProvider(url, PULSECHAIN_CHAIN_ID);
    rpcByUrl.set(url, p);
  }
  return p;
}

/**
 * JSON-RPC via public PulseChain endpoints with failover.
 * Used for eth_call / eth_estimateGas / eth_getBalance etc. from dApps.
 * Must use JsonRpcProvider.send — NOT FallbackProvider (no .send in ethers v6).
 */
async function rpcSend(method, params = []) {
  let lastErr;
  for (const url of PULSECHAIN_RPC_URLS) {
    try {
      return await getJsonRpc(url).send(method, params);
    } catch (err) {
      lastErr = err;
      console.warn(`[Voodoo RPC] ${method} failed on ${url}:`, err?.message || err);
    }
  }
  throw lastErr || new Error(`RPC ${method} failed on all endpoints`);
}

async function getState() {
  const { dappState = {} } = await chrome.storage.local.get('dappState');
  return dappState || {};
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ dappState: next });
  await refreshActionBadge(next);
  return next;
}

/** Per-request reply store so content scripts can poll by id */
async function storeReply(id, result, error = null) {
  if (!id) return;
  // Omit null error so inpage never confuses empty error with a failure
  const payload = {
    type: 'VOODOO_DAPP_RESPONSE',
    id,
    result: result ?? null,
    ts: Date.now(),
  };
  if (error != null) {
    payload.error = error;
  }
  try {
    const { dappReplies = {} } = await chrome.storage.local.get('dappReplies');
    const next = { ...dappReplies, [id]: payload };
    // prune old replies (keep last ~40)
    const keys = Object.keys(next);
    if (keys.length > 40) {
      keys
        .sort((a, b) => (next[a].ts || 0) - (next[b].ts || 0))
        .slice(0, keys.length - 40)
        .forEach((k) => { delete next[k]; });
    }
    await chrome.storage.local.set({
      dappReplies: next,
      lastDappResponse: payload,
    });
  } catch (e) {
    console.warn('[Voodoo] storeReply failed', e);
  }
  return payload;
}

export async function takeReply(id) {
  if (!id) return null;
  try {
    const { dappReplies = {} } = await chrome.storage.local.get('dappReplies');
    return dappReplies[id] || null;
  } catch {
    return null;
  }
}

/**
 * Deliver reply to page via storage + tabs.
 * Returns payload so caller can also put it on the runtime message response (most reliable).
 */
async function respond(id, result, error = null, tabId = null, origin = null) {
  const payload = await storeReply(id, result, error);

  const sendToTab = async (idTab) => {
    if (idTab == null || !payload) return;
    try {
      await chrome.tabs.sendMessage(idTab, payload);
    } catch {
      /* no receiver */
    }
  };

  await sendToTab(tabId);

  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(async (tab) => {
      if (!tab.id || !tab.url) return;
      if (origin && !tab.url.startsWith(origin)) return;
      if (!origin && !/^https?:\/\//i.test(tab.url)) return;
      await sendToTab(tab.id);
    }));
  } catch {
    /* ignore */
  }

  // Re-broadcast for late listeners
  setTimeout(() => { storeReply(id, result, error); }, 300);
  setTimeout(() => { storeReply(id, result, error); }, 1000);

  return payload;
}

async function broadcastAccountsToTab(tabId, accounts) {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'VOODOO_ACCOUNTS_BROADCAST',
      accounts,
    });
  } catch {
    /* tab may be closed */
  }
}

async function broadcastAccountsToOrigin(origin, accounts) {
  if (!origin) return;
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (!tab.id || !tab.url?.startsWith(origin)) return;
    await broadcastAccountsToTab(tab.id, accounts);
  }));
}

async function broadcastAccountsForConnections() {
  const state = await getState();
  const origins = Object.entries(state.connections || {})
    .filter(([, allowed]) => allowed)
    .map(([origin]) => origin);
  const accounts = state.activeAddress ? [state.activeAddress] : [];
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (!tab.id || !tab.url) return;
    const connected = origins.some((origin) => tab.url.startsWith(origin));
    if (!connected) return;
    await broadcastAccountsToTab(tab.id, accounts);
  }));
}

function pendingBadgeTitle(state) {
  if (state.pendingConnect) {
    return state.pendingConnect.needsUnlock
      ? 'Voodoo Wallet — Unlock, then connect'
      : 'Voodoo Wallet — Choose account & Connect';
  }
  if (state.pendingSign) {
    const method = state.pendingSign.method || '';
    const data = String(state.pendingSign.params?.[0]?.data || '').toLowerCase();
    if (method === 'eth_sendTransaction' && data.startsWith('0x095ea7b3')) {
      return 'Voodoo Wallet — Approve token spending';
    }
    if (method === 'eth_sendTransaction') {
      return 'Voodoo Wallet — Confirm transaction';
    }
    return 'Voodoo Wallet — Approve request';
  }
  return 'Voodoo Wallet';
}

export async function refreshActionBadge(state = null) {
  const current = state || await getState();
  const pending = current.pendingConnect || current.pendingSign;
  if (pending) {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#D73847' });
    await chrome.action.setTitle({ title: pendingBadgeTitle(current) });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Voodoo Wallet' });
  }
}

async function isOriginConnected(origin) {
  const state = await getState();
  return (state.connections || {})[origin] === true;
}

/** Last chrome.windows popup opened for dApp approve/connect (service-worker memory). */
let approvalWindowId = null;

function getPopupPageUrl() {
  try {
    const path = chrome.runtime.getManifest()?.action?.default_popup
      || 'src/popup/index.html';
    return chrome.runtime.getURL(path);
  } catch {
    return chrome.runtime.getURL('src/popup/index.html');
  }
}

/**
 * Open the wallet UI for a pending dApp request.
 * chrome.action.openPopup() usually fails from the service worker (no extension
 * user-gesture). Fallback: focused popup window so Approve always appears.
 */
async function openWalletForApproval() {
  // 1) Try toolbar popup (works only in rare gesture-propagating cases)
  try {
    if (chrome.action?.openPopup) {
      await chrome.action.openPopup();
      return true;
    }
  } catch {
    /* expected on most Chrome builds when called from SW */
  }

  // 2) Focus existing approval window if still open
  if (approvalWindowId != null && chrome.windows?.update) {
    try {
      await chrome.windows.update(approvalWindowId, { focused: true, drawAttention: true });
      return true;
    } catch {
      approvalWindowId = null;
    }
  }

  // 3) Find any already-open Voodoo popup/tab with our popup page
  const popupUrl = getPopupPageUrl();
  try {
    const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('')}*` });
    const existing = tabs.find((t) => t.url && (
      t.url === popupUrl
      || t.url.startsWith(popupUrl)
      || t.url.includes('/popup/index.html')
    ));
    if (existing?.windowId != null) {
      approvalWindowId = existing.windowId;
      await chrome.windows.update(existing.windowId, { focused: true, drawAttention: true });
      if (existing.id != null) {
        await chrome.tabs.update(existing.id, { active: true });
      }
      return true;
    }
  } catch {
    /* ignore query failures */
  }

  // 4) Open a dedicated popup window (reliable for dApp Approve / Connect)
  try {
    const win = await chrome.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 400,
      height: 640,
      focused: true,
    });
    approvalWindowId = win?.id ?? null;
    return Boolean(win?.id);
  } catch (err) {
    console.warn('[Voodoo] openWalletForApproval failed', err?.message || err);
    return false;
  }
}

async function queueUserApproval(type, payload) {
  await setState({ [type]: { ...payload, createdAt: Date.now() } });
  // Always set badge so toolbar shows "!" even if window open is delayed
  await refreshActionBadge();

  let opened = await openWalletForApproval();
  if (!opened) {
    // Service worker may still be waking — retry shortly
    await new Promise((r) => setTimeout(r, 200));
    opened = await openWalletForApproval();
  }
  if (!opened) {
    setTimeout(() => {
      openWalletForApproval().catch(() => {});
    }, 500);
  }
}

/**
 * Handle dApp RPC. Returns a value for chrome.runtime.sendMessage response:
 * { immediate: true, payload } when finished now
 * { pending: true } when waiting for unlock/approve
 */
export async function handleDappRequest(msg, tabId = null) {
  const { id, method, params = [], origin } = msg;
  const state = await getState();
  const activeAddress = state.activeAddress || null;

  const done = async (result, error = null) => {
    const payload = await respond(id, result, error, tabId, origin);
    return { immediate: true, payload };
  };

  try {
    if (requestsAccountPermission(method, params)) {
      // Already connected to this origin with an unlocked account → return immediately
      // (MetaMask-style: no second prompt if site is already approved)
      if (activeAddress && (await isOriginConnected(origin))) {
        await broadcastAccountsToTab(tabId, [activeAddress]);
        return done([activeAddress], null);
      }

      // Always show account-picker connect screen in the popup (like MetaMask).
      // User must pick an account and press Connect — never auto-approve.
      await queueUserApproval('pendingConnect', {
        id,
        origin,
        hostname: msg.hostname,
        tabId,
        needsUnlock: !activeAddress,
      });
      return { pending: true, needsUnlock: !activeAddress };
    }

    switch (method) {
      case 'eth_chainId':
        return done(PULSECHAIN_CHAIN_ID_HEX, null);

      case 'net_version':
        return done(String(PULSECHAIN_CHAIN_ID), null);

      case 'eth_accounts': {
        const connected = await isOriginConnected(origin);
        return done(connected && activeAddress ? [activeAddress] : [], null);
      }

      case 'wallet_getPermissions': {
        const connected = await isOriginConnected(origin);
        return done(
          connected
            ? [{ parentCapability: 'eth_accounts', date: Date.now(), caveats: [] }]
            : [],
          null,
        );
      }

      case 'wallet_revokePermissions': {
        const perm = params[0];
        if (perm?.eth_accounts) {
          const connections = { ...(state.connections || {}) };
          delete connections[origin];
          await setState({ connections });
          await broadcastAccountsToOrigin(origin, []);
        }
        return done(null, null);
      }

      case 'eth_sign':
        return done(null, {
          code: -32601,
          message: 'eth_sign is disabled for security. Use personal_sign.',
        });

      case 'personal_sign':
      case 'eth_signTypedData':
      case 'eth_signTypedData_v4':
      case 'eth_sendTransaction': {
        if (!activeAddress) {
          return done(null, { code: 4100, message: 'Wallet locked' });
        }
        if (!(await isOriginConnected(origin))) {
          return done(null, { code: 4100, message: 'Connect to this site first' });
        }
        await queueUserApproval('pendingSign', {
          id, method, params, origin, hostname: msg.hostname, tabId,
        });
        return { pending: true };
      }

      default: {
        if (method === 'wallet_switchEthereumChain') {
          const chain = params[0]?.chainId;
          if (isUnsupportedChainSwitch(chain)) {
            return done(null, { code: 4902, message: 'Only PulseChain (369) supported' });
          }
          return done(null, null);
        }

        if (isReadOnlyRpcMethod(method)) {
          // eth_estimateGas / eth_call during Approve & Stake
          const result = await rpcSend(method, params);
          return done(result, null);
        }

        return done(null, {
          code: -32601,
          message: `Method ${method} not supported`,
        });
      }
    }
  } catch (err) {
    return done(null, { code: -32603, message: err.message || 'Internal error' });
  }
}

export async function approveConnect(origin, addressOverride = null) {
  const state = await getState();
  const pending = state.pendingConnect || {};
  const requestId = pending.id;
  const tabId = pending.tabId ?? null;
  const targetOrigin = origin || pending.origin;
  const address = addressOverride || state.activeAddress || null;

  if (!address) {
    return { ok: false, error: 'Wallet locked — unlock first' };
  }

  const connections = { ...(state.connections || {}) };
  if (targetOrigin) connections[targetOrigin] = true;

  // Persist selected account as active for future dApp calls
  await setState({
    connections,
    pendingConnect: null,
    activeAddress: address,
  });
  const accounts = [address];

  if (requestId) {
    await respond(requestId, accounts, null, tabId, targetOrigin);
  }
  await broadcastAccountsToTab(tabId, accounts);
  if (targetOrigin) {
    await broadcastAccountsToOrigin(targetOrigin, accounts);
  }
  await refreshActionBadge();
  await closeApprovalWindow();
  return { ok: true, accounts };
}

/** Close dedicated approve/connect popup window (not the toolbar popup). */
async function closeApprovalWindow() {
  const id = approvalWindowId;
  approvalWindowId = null;
  if (id == null || !chrome.windows?.remove) return;
  try {
    await chrome.windows.remove(id);
  } catch {
    /* already closed */
  }
}

/**
 * @param {{ closeWindow?: boolean }} [opts]
 * closeWindow: false when user switches wallet tabs (stay in popup, treat as cancel)
 */
export async function rejectConnect({ closeWindow = true } = {}) {
  const state = await getState();
  if (state.pendingConnect?.id) {
    await respond(
      state.pendingConnect.id,
      null,
      { code: 4001, message: 'User rejected connection' },
      state.pendingConnect.tabId,
      state.pendingConnect.origin,
    );
  }
  await setState({ pendingConnect: null });
  await refreshActionBadge();
  if (closeWindow) await closeApprovalWindow();
}

export async function approveSign(result) {
  const state = await getState();
  if (state.pendingSign?.id) {
    await respond(
      state.pendingSign.id,
      result,
      null,
      state.pendingSign.tabId,
      state.pendingSign.origin,
    );
  }
  await setState({ pendingSign: null });
  await refreshActionBadge();
  // Keep window open for in-wallet progress → success UI
}

/**
 * @param {{ closeWindow?: boolean }} [opts]
 * closeWindow: false when user switches wallet tabs (stay in popup, treat as cancel)
 */
export async function rejectSign({ closeWindow = true } = {}) {
  const state = await getState();
  if (state.pendingSign?.id) {
    await respond(
      state.pendingSign.id,
      null,
      { code: 4001, message: 'User rejected request' },
      state.pendingSign.tabId,
      state.pendingSign.origin,
    );
  }
  await setState({ pendingSign: null });
  await refreshActionBadge();
  if (closeWindow) await closeApprovalWindow();
}

export async function setActiveAddress(address) {
  const state = await setState({ activeAddress: address || null });
  await broadcastAccountsForConnections();
  // Do not auto-approve pending connect — user picks account in DappPrompt (MetaMask-style).
  return state;
}

export async function getPendingDapp() {
  const state = await getState();
  return {
    connect: state.pendingConnect || null,
    sign: state.pendingSign || null,
    activeAddress: state.activeAddress || null,
  };
}

export async function getConnectedOrigins() {
  const state = await getState();
  return Object.entries(state.connections || {})
    .filter(([, allowed]) => allowed)
    .map(([origin]) => origin)
    .sort();
}

export async function disconnectOrigin(origin) {
  const connections = { ...(await getState()).connections || {} };
  delete connections[origin];
  await setState({ connections });
  await broadcastAccountsToOrigin(origin, []);
}

/** Diagnostics for debugging connect from content script / page */
export async function getDappDebug() {
  const state = await getState();
  return {
    activeAddress: state.activeAddress || null,
    pendingConnect: state.pendingConnect || null,
    connections: state.connections || {},
  };
}
