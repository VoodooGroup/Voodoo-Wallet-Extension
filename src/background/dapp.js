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
  return dappState;
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ dappState: next });
  await refreshActionBadge(next);
  return next;
}

function respond(id, result, error = null, tabId = null) {
  const payload = { type: 'VOODOO_DAPP_RESPONSE', id, result, error };
  if (tabId) chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

async function broadcastAccountsToTab(tabId, accounts) {
  if (!tabId) return;
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
    const label = current.pendingConnect ? 'Approve connection' : 'Approve request';
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#D73847' });
    await chrome.action.setTitle({ title: `Voodoo Wallet — ${label} (open extension)` });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Voodoo Wallet' });
  }
}

async function isOriginConnected(origin) {
  const state = await getState();
  return (state.connections || {})[origin] === true;
}

async function queueUserApproval(type, payload) {
  await setState({ [type]: { ...payload, createdAt: Date.now() } });
  try {
    await chrome.action.openPopup();
  } catch {
    /* popup may not open without user gesture — badge prompts user */
  }
}

export async function handleDappRequest(msg, tabId = null) {
  const { id, method, params = [], origin } = msg;
  const state = await getState();
  const activeAddress = state.activeAddress || null;

  try {
    if (requestsAccountPermission(method, params)) {
      if (!activeAddress) {
        respond(id, null, { code: 4100, message: 'Unlock Voodoo Wallet first' }, tabId);
        return;
      }
      await queueUserApproval('pendingConnect', {
        id, origin, hostname: msg.hostname, tabId,
      });
      return;
    }

    switch (method) {
      case 'eth_chainId':
        respond(id, PULSECHAIN_CHAIN_ID_HEX, null, tabId);
        break;

      case 'net_version':
        respond(id, String(PULSECHAIN_CHAIN_ID), null, tabId);
        break;

      case 'eth_accounts': {
        const connected = await isOriginConnected(origin);
        respond(id, connected && activeAddress ? [activeAddress] : [], null, tabId);
        break;
      }

      case 'wallet_getPermissions': {
        const connected = await isOriginConnected(origin);
        respond(
          id,
          connected
            ? [{ parentCapability: 'eth_accounts', date: Date.now(), caveats: [] }]
            : [],
          null,
          tabId,
        );
        break;
      }

      case 'wallet_revokePermissions': {
        const perm = params[0];
        if (perm?.eth_accounts) {
          const connections = { ...(state.connections || {}) };
          delete connections[origin];
          await setState({ connections });
          respond(id, null, null, tabId);
          await broadcastAccountsToOrigin(origin, []);
        } else {
          respond(id, null, null, tabId);
        }
        break;
      }

      case 'eth_sign':
        respond(id, null, {
          code: -32601,
          message: 'eth_sign is disabled for security. The site should use personal_sign.',
        }, tabId);
        break;

      case 'personal_sign':
      case 'eth_signTypedData':
      case 'eth_signTypedData_v4':
      case 'eth_sendTransaction': {
        if (!activeAddress) {
          respond(id, null, { code: 4100, message: 'Wallet locked' }, tabId);
          break;
        }
        if (!(await isOriginConnected(origin))) {
          respond(id, null, { code: 4100, message: 'Connect to this site first' }, tabId);
          break;
        }
        await queueUserApproval('pendingSign', {
          id, method, params, origin, hostname: msg.hostname, tabId,
        });
        break;
      }

      default: {
        if (method === 'wallet_switchEthereumChain') {
          const chain = params[0]?.chainId;
          if (isUnsupportedChainSwitch(chain)) {
            respond(id, null, { code: 4902, message: 'Only PulseChain (369) supported' }, tabId);
            break;
          }
          respond(id, null, null, tabId);
          break;
        }

        if (isReadOnlyRpcMethod(method)) {
          const result = await getRpc().send(method, params);
          respond(id, result, null, tabId);
          break;
        }

        if (method?.startsWith('eth_')) {
          respond(id, null, {
            code: -32601,
            message: `Method ${method} is not supported or requires wallet approval`,
          }, tabId);
          break;
        }

        respond(id, null, { code: -32601, message: `Method ${method} not supported` }, tabId);
      }
    }
  } catch (err) {
    respond(id, null, { code: -32603, message: err.message || 'Internal error' }, tabId);
  }
}

export async function approveConnect(origin) {
  const state = await getState();
  const connections = { ...(state.connections || {}), [origin]: true };
  const { id: requestId, tabId } = state.pendingConnect || {};
  await setState({ connections, pendingConnect: null });
  const accounts = state.activeAddress ? [state.activeAddress] : [];
  if (requestId) {
    respond(requestId, accounts, null, tabId);
  }
  await broadcastAccountsToTab(tabId, accounts);
}

export async function rejectConnect() {
  const state = await getState();
  if (state.pendingConnect?.id) {
    respond(
      state.pendingConnect.id,
      null,
      { code: 4001, message: 'User rejected connection' },
      state.pendingConnect.tabId,
    );
  }
  await setState({ pendingConnect: null });
}

export async function approveSign(result) {
  const state = await getState();
  if (state.pendingSign?.id) {
    respond(state.pendingSign.id, result, null, state.pendingSign.tabId);
  }
  await setState({ pendingSign: null });
}

export async function rejectSign() {
  const state = await getState();
  if (state.pendingSign?.id) {
    respond(
      state.pendingSign.id,
      null,
      { code: 4001, message: 'User rejected request' },
      state.pendingSign.tabId,
    );
  }
  await setState({ pendingSign: null });
}

export async function setActiveAddress(address) {
  const state = await setState({ activeAddress: address || null });
  await broadcastAccountsForConnections();
  return state;
}

export async function getPendingDapp() {
  const state = await getState();
  return {
    connect: state.pendingConnect || null,
    sign: state.pendingSign || null,
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