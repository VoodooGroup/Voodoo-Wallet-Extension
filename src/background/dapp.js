import { FallbackProvider, JsonRpcProvider } from 'ethers';
import { PULSECHAIN_RPC_URLS } from '../config/rpc.js';
import {
  isReadOnlyRpcMethod,
  isUnsupportedChainSwitch,
  PULSECHAIN_CHAIN_ID,
  PULSECHAIN_CHAIN_ID_HEX,
  requestsAccountPermission,
} from '../lib/dapp-methods.js';

let rpcProvider;

function getRpc() {
  if (!rpcProvider) {
    rpcProvider = new FallbackProvider(
      PULSECHAIN_RPC_URLS.map((url, priority) => ({
        provider: new JsonRpcProvider(url, PULSECHAIN_CHAIN_ID),
        priority,
        stallTimeout: 2500,
      })),
      PULSECHAIN_CHAIN_ID,
    );
  }
  return rpcProvider;
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
  const payload = {
    type: 'VOODOO_DAPP_RESPONSE',
    id,
    result: result ?? null,
    error: error ?? null,
    ts: Date.now(),
  };
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

export async function refreshActionBadge(state = null) {
  const current = state || await getState();
  const pending = current.pendingConnect || current.pendingSign;
  if (pending) {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#D73847' });
    await chrome.action.setTitle({
      title: current.pendingConnect
        ? 'Voodoo Wallet — Unlock to connect site'
        : 'Voodoo Wallet — Approve request',
    });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Voodoo Wallet' });
  }
}

async function isOriginConnected(origin) {
  const state = await getState();
  return (state.connections || {})[origin] === true;
}

async function tryOpenWalletPopup() {
  try {
    if (chrome.action?.openPopup) {
      await chrome.action.openPopup();
      return true;
    }
  } catch {
    /* badge still prompts user */
  }
  return false;
}

async function queueUserApproval(type, payload) {
  await setState({ [type]: { ...payload, createdAt: Date.now() } });
  await tryOpenWalletPopup();
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
      // Unlocked → connect immediately (site button click = consent)
      if (activeAddress) {
        const connections = { ...(state.connections || {}), [origin]: true };
        await setState({ connections, pendingConnect: null });
        await broadcastAccountsToTab(tabId, [activeAddress]);
        await broadcastAccountsToOrigin(origin, [activeAddress]);
        return done([activeAddress], null);
      }

      // Locked → wait for unlock (auto-approve in setActiveAddress)
      await queueUserApproval('pendingConnect', {
        id,
        origin,
        hostname: msg.hostname,
        tabId,
        needsUnlock: true,
      });
      return { pending: true, needsUnlock: true };
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
          const result = await getRpc().send(method, params);
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

  await setState({ connections, pendingConnect: null });
  const accounts = [address];

  if (requestId) {
    await respond(requestId, accounts, null, tabId, targetOrigin);
  }
  await broadcastAccountsToTab(tabId, accounts);
  if (targetOrigin) {
    await broadcastAccountsToOrigin(targetOrigin, accounts);
  }
  return { ok: true, accounts };
}

export async function rejectConnect() {
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
}

export async function rejectSign() {
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
}

export async function setActiveAddress(address) {
  const state = await setState({ activeAddress: address || null });
  await broadcastAccountsForConnections();

  if (address && state.pendingConnect?.id) {
    try {
      await approveConnect(state.pendingConnect.origin, address);
    } catch (e) {
      console.warn('Auto-approve pending connect failed', e);
    }
  }

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
