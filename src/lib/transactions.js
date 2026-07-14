import { Contract, formatEther, formatUnits } from 'ethers';
import { getProvider } from './chain';
import { DEFAULT_TOKENS, ERC20_ABI, PULSECHAIN } from '../config/pulsechain';

const PAGE_SIZE = 25;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7b7c163c06c28c29c94c9cec60';
const SCAN_API = PULSECHAIN.scanApi;
const tokenMetaCache = new Map();

const knownTokens = Object.fromEntries(
  DEFAULT_TOKENS.map((t) => [t.address.toLowerCase(), t]),
);

function scanParams(action, address, page) {
  return new URLSearchParams({
    module: 'account',
    action,
    address,
    page: String(page),
    offset: String(PAGE_SIZE),
    sort: 'desc',
  });
}

function parseScanResult(json) {
  if (json?.status === '1' && Array.isArray(json.result)) return json.result;
  if (json?.message === 'No transactions found') return [];
  if (json?.status === '0' && Array.isArray(json.result) && json.result.length === 0) return [];
  if (json?.status === '0') return [];
  throw new Error(json?.message || json?.result || 'Scan API error');
}

function mapPlsTx(tx, wallet) {
  const from = (tx.from || '').toLowerCase();
  return {
    id: `pls-${tx.hash}`,
    hash: tx.hash,
    type: 'pls',
    symbol: 'PLS',
    direction: from === wallet ? 'sent' : 'received',
    counterparty: from === wallet ? tx.to : tx.from,
    amount: formatEther(tx.value || '0'),
    timestamp: Number(tx.timeStamp || 0) * 1000,
    status: tx.txreceipt_status === '0' ? 'failed' : 'success',
  };
}

function mapTokenTx(tx, wallet) {
  const from = (tx.from || '').toLowerCase();
  return {
    id: `token-${tx.hash}-${tx.logIndex ?? tx.transactionIndex ?? '0'}`,
    hash: tx.hash,
    type: 'token',
    symbol: tx.tokenSymbol || 'TOKEN',
    direction: from === wallet ? 'sent' : 'received',
    counterparty: from === wallet ? tx.to : tx.from,
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
    const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
    const meta = { symbol, decimals: Number(decimals) };
    tokenMetaCache.set(key, meta);
    return meta;
  } catch {
    const meta = { symbol: 'TOKEN', decimals: 18 };
    tokenMetaCache.set(key, meta);
    return meta;
  }
}

async function fetchViaScanApi(address, page = 1) {
  const wallet = address.toLowerCase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const headers = { accept: 'application/json' };

  try {
    const [plsRes, tokenRes] = await Promise.all([
      fetch(`${SCAN_API}?${scanParams('txlist', address, page)}`, { signal: controller.signal, headers }),
      fetch(`${SCAN_API}?${scanParams('tokentx', address, page)}`, { signal: controller.signal, headers }),
    ]);

    if (!plsRes.ok && !tokenRes.ok) {
      throw new Error(`Scan API unavailable (${plsRes.status || tokenRes.status})`);
    }

    const [plsJson, tokenJson] = await Promise.all([
      plsRes.ok ? plsRes.json() : { status: '0', result: [] },
      tokenRes.ok ? tokenRes.json() : { status: '0', result: [] },
    ]);

    const plsRows = parseScanResult(plsJson);
    const tokenRows = parseScanResult(tokenJson);

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
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaRpc(address, blockNo = 99_999_999) {
  const provider = getProvider();
  const data = await provider.send('ots_searchTransactionsBefore', [address, blockNo, PAGE_SIZE]);
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
      items.push({
        id: `pls-${tx.hash}`,
        hash: tx.hash,
        type: 'pls',
        symbol: 'PLS',
        direction: from === wallet ? 'sent' : 'received',
        counterparty: from === wallet ? tx.to : tx.from,
        amount: formatEther(tx.value),
        timestamp,
        status: receipt?.status === '0x1' ? 'success' : 'failed',
      });
    }
  }

  for (const receipt of receipts) {
    for (const log of receipt.logs || []) {
      if ((log.topics?.[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
      if (!log.topics?.[1] || !log.topics?.[2]) continue;

      const from = `0x${log.topics[1].slice(26)}`.toLowerCase();
      const to = `0x${log.topics[2].slice(26)}`.toLowerCase();
      if (from !== wallet && to !== wallet) continue;

      const meta = await getTokenMeta(log.address);
      items.push({
        id: `token-${log.transactionHash}-${log.logIndex}`,
        hash: log.transactionHash,
        type: 'token',
        symbol: meta.symbol,
        direction: from === wallet ? 'sent' : 'received',
        counterparty: from === wallet ? `0x${log.topics[2].slice(26)}` : `0x${log.topics[1].slice(26)}`,
        amount: formatUnits(log.data || '0x0', meta.decimals),
        timestamp: Number(receipt.timestamp || 0) * 1000,
        status: receipt.status === '0x1' ? 'success' : 'failed',
      });
    }
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

export async function fetchWalletActivity(address, cursor = null, source = 'scan') {
  if (!address) return { items: [], hasMore: false, nextCursor: null, source: 'scan' };

  if (source === 'rpc') {
    return fetchViaRpc(address, cursor ?? 99_999_999);
  }

  if (cursor) {
    return fetchViaScanApi(address, cursor);
  }

  try {
    return await fetchViaScanApi(address, 1);
  } catch (scanErr) {
    try {
      const rpc = await fetchViaRpc(address);
      if (rpc.items.length > 0) return rpc;
      throw scanErr;
    } catch {
      throw new Error(
        scanErr.name === 'AbortError'
          ? 'Scan API timed out — try Refresh'
          : (scanErr.message || 'Could not load transaction history'),
      );
    }
  }
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