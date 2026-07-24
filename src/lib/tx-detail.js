import { Contract, formatEther, formatUnits } from 'ethers';
import { getProvider } from './chain';
import { DEFAULT_TOKENS, ERC20_ABI, PULSECHAIN } from '../config/pulsechain';

const SCAN_API = PULSECHAIN.scanApi;
const SCAN_TIMEOUT_MS = 3_000;
const SCAN_ENRICH_BUDGET_MS = 2_000;
const TX_DETAIL_CACHE_TTL_MS = 120_000;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7b7c163c06c28c29c94c9cec60';

const knownTokens = Object.fromEntries(
  DEFAULT_TOKENS.map((t) => [t.address.toLowerCase(), t]),
);
const contractNameCache = new Map();
const tokenMetaCache = new Map();
const txDetailCache = new Map();

/** PulseScan is optional enrichment — never block RPC-backed detail on 500/timeout. */
async function scanGet(module, action, params) {
  const qs = new URLSearchParams({ module, action, ...params });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(`${SCAN_API}?${qs}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status === '1') return json.result;
    if (json?.message === 'No transactions found') return null;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getTokenMeta(address) {
  const key = address.toLowerCase();
  if (tokenMetaCache.has(key)) return tokenMetaCache.get(key);
  if (knownTokens[key]) {
    const meta = {
      symbol: knownTokens[key].symbol,
      decimals: knownTokens[key].decimals,
      name: knownTokens[key].name,
    };
    tokenMetaCache.set(key, meta);
    return meta;
  }
  try {
    const contract = new Contract(address, ERC20_ABI, getProvider());
    const [symbol, decimals, name] = await Promise.all([
      contract.symbol(),
      contract.decimals(),
      contract.name(),
    ]);
    const meta = { symbol, decimals: Number(decimals), name };
    tokenMetaCache.set(key, meta);
    return meta;
  } catch {
    const meta = { symbol: 'TOKEN', decimals: 18, name: 'Token' };
    tokenMetaCache.set(key, meta);
    return meta;
  }
}

export async function fetchContractName(address) {
  if (!address) return null;
  const key = address.toLowerCase();
  if (contractNameCache.has(key)) return contractNameCache.get(key);
  const result = await scanGet('contract', 'getsourcecode', { address });
  const row = Array.isArray(result) ? result[0] : result;
  const name = row?.ContractName?.trim() || null;
  contractNameCache.set(key, name);
  return name;
}

function topicAddress(topic) {
  if (!topic || topic.length < 66) return '';
  return `0x${topic.slice(26)}`.toLowerCase();
}

function parseTokenTransfers(logs = []) {
  const transfers = [];
  for (const log of logs) {
    const topic0 = (log.topics?.[0] || '').toLowerCase();
    if (topic0 !== TRANSFER_TOPIC) continue;

    const from = topicAddress(log.topics?.[1]);
    const to = topicAddress(log.topics?.[2]);
    if (!from || !to) continue;

    const token = (log.address || '').toLowerCase();
    const isNft = (log.topics?.length || 0) > 3;
    const rawValue = isNft
      ? (log.topics?.[3] || log.data || '0x0')
      : (log.data || '0x0');

    transfers.push({
      id: `${log.transactionHash || log.hash || ''}-${log.logIndex ?? log.index ?? transfers.length}`,
      token,
      from,
      to,
      rawValue: String(rawValue),
      isNft,
      logIndex: log.logIndex ?? log.index,
    });
  }
  return transfers;
}

async function enrichTransfers(transfers) {
  return Promise.all(transfers.map(async (tx) => {
    const meta = await getTokenMeta(tx.token);
    let amount = tx.rawValue;
    if (!tx.isNft) {
      try {
        amount = formatUnits(tx.rawValue, meta.decimals);
      } catch {
        amount = tx.rawValue;
      }
    }
    return {
      ...tx,
      symbol: meta.symbol,
      tokenName: meta.name,
      amount,
      amountLabel: tx.isNft ? `#${BigInt(tx.rawValue).toString()}` : amount,
    };
  }));
}

function normalizeRpcLogs(receipt) {
  return (receipt?.logs || []).map((log) => ({
    address: log.address,
    topics: [...(log.topics || [])],
    data: log.data,
    logIndex: log.index,
    transactionHash: receipt.hash,
  }));
}

function normalizeScanLogs(info) {
  return (info?.logs || []).map((log) => ({
    address: log.address,
    topics: [...(log.topics || []).filter(Boolean)],
    data: log.data || '0x',
    logIndex: log.index,
    transactionHash: info.hash,
  }));
}

function calcTxFee(gasUsed, gasPrice, effectiveGasPrice) {
  const used = BigInt(gasUsed || '0');
  const price = BigInt(effectiveGasPrice || gasPrice || '0');
  if (used === 0n || price === 0n) return '0';
  return formatEther(used * price);
}

async function resolveTimestamp(scanInfo, rpcReceipt, provider) {
  const scanTs = Number(scanInfo?.timeStamp || 0) * 1000;
  if (scanTs > 0) return scanTs;
  if (rpcReceipt?.blockNumber == null) return 0;
  try {
    const block = await provider.getBlock(rpcReceipt.blockNumber);
    return (block?.timestamp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function startScanEnrichment(hash) {
  return Promise.all([
    scanGet('transaction', 'gettxinfo', { txhash: hash }),
    scanGet('account', 'txlistinternal', { txhash: hash }),
    scanGet('transaction', 'getstatus', { txhash: hash }),
  ]).then(([scanInfo, internal, status]) => ({ scanInfo, internal, status }));
}

async function awaitScanEnrichment(scanPromise, startedAt) {
  const remaining = Math.max(0, SCAN_ENRICH_BUDGET_MS - (Date.now() - startedAt));
  if (remaining === 0) return null;

  return Promise.race([
    scanPromise,
    delay(remaining).then(() => null),
  ]);
}

function cachedContractName(address) {
  if (!address) return null;
  return contractNameCache.get(address.toLowerCase()) ?? null;
}

function prefetchContractName(address) {
  if (!address || cachedContractName(address)) return;
  fetchContractName(address).catch(() => {});
}

export async function fetchTxDetail(hash) {
  if (!hash) throw new Error('Missing transaction hash');

  const cacheKey = hash.toLowerCase();
  const cached = txDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TX_DETAIL_CACHE_TTL_MS) {
    return cached.data;
  }

  const startedAt = Date.now();
  const provider = getProvider();
  const scanPromise = startScanEnrichment(hash);

  const [rpcTx, rpcReceipt] = await Promise.all([
    provider.getTransaction(hash).catch(() => null),
    provider.getTransactionReceipt(hash).catch(() => null),
  ]);

  let scanInfo = null;
  let internal = null;
  let status = null;

  if (rpcTx || rpcReceipt) {
    const enrichment = await awaitScanEnrichment(scanPromise, startedAt);
    if (enrichment) {
      ({ scanInfo, internal, status } = enrichment);
    }
  } else {
    const enrichment = await scanPromise;
    ({ scanInfo, internal, status } = enrichment);
    if (!scanInfo) throw new Error('Transaction not found');
  }

  const scanLogs = normalizeScanLogs(scanInfo);
  const logs = scanLogs.length ? scanLogs : normalizeRpcLogs(rpcReceipt);

  const toAddress = scanInfo?.to || rpcTx?.to || '';
  prefetchContractName(toAddress);

  const [transfers, timestamp] = await Promise.all([
    enrichTransfers(parseTokenTransfers(logs)),
    resolveTimestamp(scanInfo, rpcReceipt, provider),
  ]);
  const contractName = cachedContractName(toAddress);

  const gasUsed = scanInfo?.gasUsed || rpcReceipt?.gasUsed?.toString() || '0';
  const gasLimit = scanInfo?.gasLimit || rpcTx?.gasLimit?.toString() || '0';
  const gasPrice = scanInfo?.gasPrice || rpcTx?.gasPrice?.toString() || '0';
  const effectiveGasPrice = rpcReceipt?.gasPrice?.toString() || gasPrice;

  const success = scanInfo
    ? Boolean(scanInfo.success)
    : rpcReceipt?.status === 1;

  const blockNumber = scanInfo?.blockNumber
    || (rpcReceipt?.blockNumber != null ? String(rpcReceipt.blockNumber) : '')
    || (rpcTx?.blockNumber != null ? String(rpcTx.blockNumber) : '');

  const result = {
    hash,
    status: success ? 'success' : 'failed',
    blockNumber,
    confirmations: scanInfo?.confirmations || null,
    timestamp,
    from: scanInfo?.from || rpcTx?.from || '',
    to: toAddress,
    contractName: contractName || null,
    value: formatEther(scanInfo?.value || rpcTx?.value || '0'),
    input: scanInfo?.input || rpcTx?.data || '0x',
    gasUsed,
    gasLimit,
    gasPrice,
    effectiveGasPrice,
    txFee: calcTxFee(gasUsed, gasPrice, effectiveGasPrice),
    nonce: rpcTx?.nonce != null ? String(rpcTx.nonce) : null,
    txType: rpcTx?.type != null ? String(rpcTx.type) : null,
    maxFeePerGas: rpcTx?.maxFeePerGas?.toString() || null,
    maxPriorityFeePerGas: rpcTx?.maxPriorityFeePerGas?.toString() || null,
    revertReason: scanInfo?.revertReason || '',
    errorDescription: status?.errDescription || '',
    internalTxs: Array.isArray(internal) ? internal : [],
    transfers,
    logs,
  };

  txDetailCache.set(cacheKey, { data: result, at: Date.now() });
  return result;
}

export function formatTxDetailTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatGwei(wei) {
  if (!wei || wei === '0') return '0 Gwei';
  try {
    const gwei = Number(formatUnits(wei, 9));
    return `${gwei.toLocaleString(undefined, { maximumFractionDigits: 3 })} Gwei`;
  } catch {
    return `${wei} wei`;
  }
}

export async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}