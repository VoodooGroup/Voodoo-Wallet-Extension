import { Contract, formatEther, formatUnits } from 'ethers';
import { getProvider } from './chain';
import { DEFAULT_TOKENS, ERC20_ABI, PULSECHAIN } from '../config/pulsechain';

const PAGE_SIZE = 25;
const SCAN_TXLIST_TIMEOUT_MS = 12_000;
const SCAN_TOKENTX_TIMEOUT_MS = 12_000;
const SCAN_UI_TXLIST_TIMEOUT_MS = 8_000;
const SCAN_UI_TOKENTX_TIMEOUT_MS = 20_000;
const RPC_TIMEOUT_MS = 15_000;
const TOKEN_META_TIMEOUT_MS = 4_000;
const ACTIVITY_CACHE_TTL_MS = 90_000;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7b7c163c06c28c29c94c9cec60';
const SCAN_API = PULSECHAIN.scanApi;
const tokenMetaCache = new Map();
const activityCache = new Map();

function withTimeout(promise, ms, label = 'Request') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function isScanOk(status) {
  return String(status) === '1';
}

const knownTokens = Object.fromEntries(
  DEFAULT_TOKENS.map((t) => [t.address.toLowerCase(), t]),
);

function scanParams(action, address, page, extra = {}) {
  const params = {
    module: 'account',
    action,
    address,
    page: String(page),
    offset: String(PAGE_SIZE),
    sort: 'desc',
    ...extra,
  };
  return new URLSearchParams(params);
}

function parseScanResult(json) {
  if (isScanOk(json?.status) && Array.isArray(json.result)) return json.result;
  const msg = String(json?.message || '').toLowerCase();
  if (msg.includes('no transaction') || msg.includes('no record') || msg.includes('no token transfer')) {
    return [];
  }
  if (json?.status === '0' && Array.isArray(json.result) && json.result.length === 0) return [];
  if (json?.status === '0' && (json?.result === '' || json?.result == null)) return [];
  if (json?.status === '0' && typeof json?.result === 'string' && !json.result.startsWith('0x')) return [];
  if (json?.status === '0') return [];
  throw new Error(json?.message || json?.result || 'Scan API error');
}

function mapPlsTx(tx, wallet) {
  const from = (tx.from || '').toLowerCase();
  const direction = from === wallet ? 'sent' : 'received';
  return {
    id: `pls-${tx.hash}`,
    hash: tx.hash,
    type: 'pls',
    symbol: 'PLS',
    direction,
    counterparty: from === wallet ? tx.to : tx.from,
    sender: direction === 'received' ? tx.from : undefined,
    amount: formatEther(tx.value || '0'),
    timestamp: Number(tx.timeStamp || 0) * 1000,
    status: tx.txreceipt_status === '0' ? 'failed' : 'success',
  };
}

function mapTokenTx(tx, wallet) {
  const from = (tx.from || '').toLowerCase();
  const direction = from === wallet ? 'sent' : 'received';
  return {
    id: `token-${tx.hash}-${tx.logIndex ?? tx.transactionIndex ?? '0'}`,
    hash: tx.hash,
    type: 'token',
    symbol: tx.tokenSymbol || 'TOKEN',
    direction,
    counterparty: from === wallet ? tx.to : tx.from,
    sender: direction === 'received' ? tx.from : undefined,
    amount: formatUnits(tx.value || '0', Number(tx.tokenDecimal || 18)),
    timestamp: Number(tx.timeStamp || 0) * 1000,
    status: 'success',
  };
}

async function getTokenMeta(contractAddress) {
  const key = contractAddress.toLowerCase();
  if (tokenMetaCache.has(key)) return tokenMetaCache.get(key);
  if (knownTokens[key]) {
    const meta = { symbol: knownTokens[key].symbol, decimals: knownTokens[key].decimals };
    tokenMetaCache.set(key, meta);
    return meta;
  }
  try {
    const contract = new Contract(contractAddress, ERC20_ABI, getProvider());
    const [symbol, decimals] = await withTimeout(
      Promise.all([contract.symbol(), contract.decimals()]),
      TOKEN_META_TIMEOUT_MS,
      'Token metadata',
    );
    const meta = { symbol, decimals: Number(decimals) };
    tokenMetaCache.set(key, meta);
    return meta;
  } catch {
    const meta = { symbol: 'TOKEN', decimals: 18 };
    tokenMetaCache.set(key, meta);
    return meta;
  }
}

async function fetchScanAction(action, address, page, timeoutMs, extra = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SCAN_API}?${scanParams(action, address, page, extra)}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Scan API unavailable (${res.status})`);
    }
    return parseScanResult(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaScanApi(address, page = 1, timeouts) {
  const wallet = address.toLowerCase();
  const txlistMs = timeouts?.txlist ?? SCAN_TXLIST_TIMEOUT_MS;
  const tokentxMs = timeouts?.tokentx ?? SCAN_TOKENTX_TIMEOUT_MS;
  const [plsResult, tokenResult] = await Promise.allSettled([
    fetchScanAction('txlist', address, page, txlistMs),
    fetchScanAction('tokentx', address, page, tokentxMs),
  ]);

  const plsRows = plsResult.status === 'fulfilled' ? plsResult.value : [];
  const tokenRows = tokenResult.status === 'fulfilled' ? tokenResult.value : [];

  if (plsResult.status === 'rejected' && tokenResult.status === 'rejected') {
    const reason = plsResult.reason || tokenResult.reason;
    if (reason?.name === 'AbortError') {
      throw new Error('Scan API timed out — try Refresh');
    }
    throw reason instanceof Error ? reason : new Error(String(reason));
  }

  const items = [
    ...plsRows.map((tx) => mapPlsTx(tx, wallet)),
    ...tokenRows.map((tx) => mapTokenTx(tx, wallet)),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const plsHasMore = plsRows.length >= PAGE_SIZE;
  const tokenHasMore = tokenRows.length >= PAGE_SIZE;

  return {
    items,
    hasMore: plsHasMore || tokenHasMore,
    nextCursor: plsHasMore || tokenHasMore ? page + 1 : null,
    source: 'scan',
  };
}

async function fetchViaRpc(address, blockNo = 99_999_999) {
  const provider = getProvider();
  const data = await withTimeout(
    provider.send('ots_searchTransactionsBefore', [address, blockNo, PAGE_SIZE]),
    RPC_TIMEOUT_MS,
    'RPC history',
  );
  if (!data?.txs) return { items: [], hasMore: false, nextCursor: null, source: 'rpc' };

  const wallet = address.toLowerCase();
  const receipts = data.receipts || [];
  const receiptByHash = Object.fromEntries(receipts.map((r) => [r.transactionHash, r]));
  const items = [];

  for (const tx of data.txs) {
    const value = BigInt(tx.value || '0');
    const from = (tx.from || '').toLowerCase();
    const to = (tx.to || '').toLowerCase();
    const receipt = receiptByHash[tx.hash];
    const timestamp = Number(receipt?.timestamp || 0) * 1000;

    if (value > 0n && (from === wallet || to === wallet)) {
      const direction = from === wallet ? 'sent' : 'received';
      items.push({
        id: `pls-${tx.hash}`,
        hash: tx.hash,
        type: 'pls',
        symbol: 'PLS',
        direction,
        counterparty: from === wallet ? tx.to : tx.from,
        sender: direction === 'received' ? tx.from : undefined,
        amount: formatEther(tx.value),
        timestamp,
        status: receipt?.status === '0x1' ? 'success' : 'failed',
      });
    }
  }

  const transferLogs = [];
  for (const receipt of receipts) {
    for (const log of receipt.logs || []) {
      if ((log.topics?.[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
      if (!log.topics?.[1] || !log.topics?.[2]) continue;

      const from = `0x${log.topics[1].slice(26)}`.toLowerCase();
      const to = `0x${log.topics[2].slice(26)}`.toLowerCase();
      if (from !== wallet && to !== wallet) continue;

      transferLogs.push({ log, receipt, from, to });
    }
  }

  const uniqueTokenAddresses = [...new Set(transferLogs.map(({ log }) => log.address.toLowerCase()))];
  await Promise.all(uniqueTokenAddresses.map((addr) => getTokenMeta(addr)));

  for (const { log, receipt, from, to } of transferLogs) {
    const meta = await getTokenMeta(log.address);
    const direction = from === wallet ? 'sent' : 'received';
    const senderAddr = `0x${log.topics[1].slice(26)}`;
    const recipientAddr = `0x${log.topics[2].slice(26)}`;
    items.push({
      id: `token-${log.transactionHash}-${log.logIndex}`,
      hash: log.transactionHash,
      type: 'token',
      symbol: meta.symbol,
      direction,
      counterparty: from === wallet ? recipientAddr : senderAddr,
      sender: direction === 'received' ? senderAddr : undefined,
      amount: formatUnits(log.data || '0x0', meta.decimals),
      timestamp: Number(receipt.timestamp || 0) * 1000,
      status: receipt.status === '0x1' ? 'success' : 'failed',
    });
  }

  items.sort((a, b) => b.timestamp - a.timestamp);

  const minBlock = data.txs.reduce((min, tx) => {
    const block = parseInt(tx.blockNumber, 16);
    return min === null || block < min ? block : min;
  }, null);

  return {
    items: items.slice(0, PAGE_SIZE),
    hasMore: !data.lastPage && data.txs.length > 0,
    nextCursor: minBlock !== null ? minBlock - 1 : null,
    source: 'rpc',
  };
}

function cacheKey(address) {
  return address.toLowerCase();
}

function readActivityCache(address) {
  const entry = activityCache.get(cacheKey(address));
  if (!entry) return null;
  if (Date.now() - entry.at > ACTIVITY_CACHE_TTL_MS) {
    activityCache.delete(cacheKey(address));
    return null;
  }
  return entry.data;
}

function writeActivityCache(address, data) {
  activityCache.set(cacheKey(address), { data, at: Date.now() });
}

export function peekActivityCache(address) {
  return readActivityCache(address);
}

export function clearActivityCache(address) {
  if (address) activityCache.delete(cacheKey(address));
  else activityCache.clear();
}

function mergeActivityResults(sources) {
  const byId = new Map();
  for (const source of sources) {
    for (const item of source?.items || []) {
      byId.set(item.id, item);
    }
  }
  const items = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
  const scan = sources.find((s) => s?.source === 'scan' && s.items?.length);
  const rpc = sources.find((s) => s?.source === 'rpc' && s.items?.length);
  const primary = scan || rpc || sources.find((s) => s?.items?.length) || sources[0];

  return {
    items: items.slice(0, PAGE_SIZE),
    hasMore: sources.some((s) => s?.hasMore),
    nextCursor: primary?.nextCursor ?? null,
    source: primary?.source || 'scan',
  };
}

const SCAN_UI_TIMEOUTS = {
  txlist: SCAN_UI_TXLIST_TIMEOUT_MS,
  tokentx: SCAN_UI_TOKENTX_TIMEOUT_MS,
};

function emptyActivity(source = 'rpc') {
  return { items: [], hasMore: false, nextCursor: null, source };
}

async function fetchRpcSafe(address) {
  try {
    return await fetchViaRpc(address);
  } catch {
    return emptyActivity('rpc');
  }
}

function mapTokenRows(rows, wallet) {
  return rows.map((tx) => mapTokenTx(tx, wallet));
}

/** PulseScan `tokentx` — ERC-20 transfers (VDO, etc.). PLS comes from RPC. */
async function fetchTokenTransfersScan(address, page = 1, timeoutMs = SCAN_UI_TOKENTX_TIMEOUT_MS) {
  const wallet = address.toLowerCase();
  const rows = await fetchScanAction('tokentx', address, page, timeoutMs);
  const items = mapTokenRows(rows, wallet);
  return {
    items,
    hasMore: rows.length >= PAGE_SIZE,
    nextCursor: rows.length >= PAGE_SIZE ? page + 1 : null,
    source: 'scan',
  };
}

/** Fallback: query tokentx per known token contract (often faster than one big query). */
async function fetchKnownTokenTransfers(address) {
  const wallet = address.toLowerCase();
  const results = await Promise.allSettled(
    DEFAULT_TOKENS.map((token) => fetchScanAction(
      'tokentx',
      address,
      1,
      SCAN_UI_TOKENTX_TIMEOUT_MS,
      { contractaddress: token.address },
    )),
  );

  const seen = new Set();
  const rows = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const row of result.value) {
      const key = `${row.hash}-${row.logIndex ?? row.transactionIndex ?? '0'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  const items = mapTokenRows(rows, wallet).sort((a, b) => b.timestamp - a.timestamp);
  return {
    items,
    hasMore: false,
    nextCursor: null,
    source: 'scan',
  };
}

async function fetchTokenTransfersForActivity(address) {
  // Known tokens first (VDO, MAGIC, …) — fast per-contract queries.
  try {
    const known = await fetchKnownTokenTransfers(address);
    if (known.items.length > 0) return known;
  } catch {
    /* fall through */
  }
  // Full tokentx index last — PulseScan can take 60s+ for busy wallets.
  try {
    return await fetchTokenTransfersScan(address, 1, 30_000);
  } catch {
    return { items: [], hasMore: false, nextCursor: null, source: 'scan' };
  }
}

/** Fast first paint: RPC only (usually sub-second). */
export async function fetchActivityFast(address) {
  if (!address) return emptyActivity();
  const data = await fetchRpcSafe(address);
  writeActivityCache(address, { ...data, tokenEnriched: false });
  return data;
}

/** Full history: RPC (PLS) + PulseScan tokentx (VDO and other tokens). */
export async function fetchActivityFull(address) {
  if (!address) return emptyActivity();

  const cached = readActivityCache(address);
  const rpc = cached?.items?.length
    ? { ...cached, source: cached.source || 'rpc' }
    : await fetchRpcSafe(address);

  const tokenScan = await fetchTokenTransfersForActivity(address);
  const merged = mergeActivityResults([rpc, tokenScan]);
  const result = {
    ...merged,
    tokenEnriched: true,
  };

  if (result.items.length > 0) {
    writeActivityCache(address, result);
    return result;
  }

  if (rpc.items.length > 0) {
    writeActivityCache(address, { ...rpc, tokenEnriched: true });
    return { ...rpc, tokenEnriched: true };
  }

  throw new Error('Could not load transaction history');
}

export async function fetchWalletActivity(address, cursor = null, source = 'auto', options = {}) {
  if (!address) return { items: [], hasMore: false, nextCursor: null, source: 'rpc' };

  const { bypassCache = false } = options;

  if (source === 'rpc') {
    const data = await fetchViaRpc(address, cursor ?? 99_999_999);
    if (!cursor) writeActivityCache(address, data);
    return data;
  }

  if (source === 'scan') {
    return fetchViaScanApi(address, cursor || 1);
  }

  if (!cursor) {
    if (!bypassCache) {
      const cached = readActivityCache(address);
      if (cached) return cached;
    }

    return fetchActivityFull(address);
  }

  return fetchViaRpc(address, cursor);
}

export function explorerTxUrl(hash) {
  return `${PULSECHAIN.explorer}/tx/${hash}`;
}

export function explorerAddressUrl(address) {
  return `${PULSECHAIN.explorer}/address/${address}`;
}

export function formatTxTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}