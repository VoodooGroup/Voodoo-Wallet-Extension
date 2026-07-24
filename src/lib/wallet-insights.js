import { PULSECHAIN } from '../config/pulsechain.js';
import {
  buildGasSpending,
  buildRecentYields,
  buildUpcomingUnlocks,
  GAS_TX_LIMIT,
  yieldTokenContracts,
} from './wallet-insights-core.js';

export {
  buildGasSpending,
  buildRecentYields,
  buildUpcomingUnlocks,
  calcTxGasFee,
  getStakePool,
} from './wallet-insights-core.js';

const SCAN_API = PULSECHAIN.scanApi;
const SCAN_TIMEOUT_MS = 10_000;

async function scanTxList(address, page = 1) {
  const params = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address,
    page: String(page),
    offset: String(GAS_TX_LIMIT),
    sort: 'desc',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(`${SCAN_API}?${params}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (String(json?.status) === '1' && Array.isArray(json.result)) return json.result;
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function scanTokenTx(address, contractAddress) {
  const params = new URLSearchParams({
    module: 'account',
    action: 'tokentx',
    address,
    contractaddress: contractAddress,
    page: '1',
    offset: String(GAS_TX_LIMIT),
    sort: 'desc',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(`${SCAN_API}?${params}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (String(json?.status) === '1' && Array.isArray(json.result)) return json.result;
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchUpcomingUnlocks(address) {
  const { fetchUserStakes } = await import('./staking.js');
  const stakes = await fetchUserStakes(address);
  return buildUpcomingUnlocks(stakes);
}

export async function fetchGasSpending(address) {
  const rows = await scanTxList(address);
  return buildGasSpending(rows, address);
}

export async function fetchRecentYields(address) {
  const contracts = yieldTokenContracts();
  const results = await Promise.allSettled(
    contracts.map((contract) => scanTokenTx(address, contract)),
  );
  const rows = results.flatMap((result) => (
    result.status === 'fulfilled' ? result.value : []
  ));
  return buildRecentYields(rows, address);
}