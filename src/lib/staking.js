import { Contract, Interface, JsonRpcProvider, parseUnits, formatUnits, MaxUint256 } from 'ethers';
import { getProvider } from './chain';
import {
  checkPlsCoverage,
  FALLBACK_GAS_LIMITS,
  runWithGasCheck,
} from './gas';
import {
  STAKING_ADDRESS,
  STAKING_ABI,
  STAKING_POOLS,
  VDO_ADDRESS,
} from '../config/staking';
import { ERC20_ABI, PULSECHAIN } from '../config/pulsechain';
import { PULSECHAIN_RPC_URLS } from '../config/rpc.js';

/** Multicall3 (same address on PulseChain mainnet). */
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL3_ABI = [
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])',
];
const REWARD_RATES_IFACE = new Interface([
  'function rewardRates(uint8 rewardToken, uint256 duration) view returns (uint256)',
]);

export function getStakingContract(signerOrProvider) {
  return new Contract(STAKING_ADDRESS, STAKING_ABI, signerOrProvider || getProvider());
}

export function getVdoContract(signerOrProvider) {
  return new Contract(VDO_ADDRESS, ERC20_ABI, signerOrProvider || getProvider());
}

let apyCache = null;
let apyCacheAt = 0;
let apyInflight = null;
const approvalCache = new Map();
const APY_CACHE_MS = 120_000;
const RPC_CALL_TIMEOUT_MS = 12_000;
const APY_FETCH_TIMEOUT_MS = 18_000;

function withRpcTimeout(promise, label, ms = RPC_CALL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]);
}

function cacheApproval(owner, ok) {
  if (!owner) return;
  approvalCache.set(owner.toLowerCase(), { ok, at: Date.now() });
}

function poolsHaveAnyApy(pools) {
  return Array.isArray(pools) && pools.some((p) => p.apy != null && !Number.isNaN(Number(p.apy)));
}

export function getCachedPoolApys() {
  // Never treat an all-null failure as a warm cache (that left the UI stuck on "—")
  if (apyCache && poolsHaveAnyApy(apyCache) && Date.now() - apyCacheAt < APY_CACHE_MS) {
    return apyCache;
  }
  return null;
}

export function getCachedVdoApproval(owner) {
  if (!owner) return null;
  const hit = approvalCache.get(owner.toLowerCase());
  if (!hit || Date.now() - hit.at > APY_CACHE_MS) return null;
  return hit.ok;
}

function getRpcUrlList() {
  if (PULSECHAIN_RPC_URLS.length) return [...PULSECHAIN_RPC_URLS];
  if (PULSECHAIN.rpcUrls?.length) return [...PULSECHAIN.rpcUrls];
  return [PULSECHAIN.rpcUrl];
}

function createStaticProvider(url) {
  return new JsonRpcProvider(url, PULSECHAIN.id, { staticNetwork: true });
}

/**
 * One eth_call via Multicall3 — far more reliable than 6 parallel rewardRates
 * against a flaky primary RPC (rpc.pulsechain.com often times out).
 */
async function loadPoolApysViaMulticall(provider) {
  const multicall = new Contract(MULTICALL3, MULTICALL3_ABI, provider);
  const calls = STAKING_POOLS.map((pool) => ({
    target: STAKING_ADDRESS,
    allowFailure: true,
    callData: REWARD_RATES_IFACE.encodeFunctionData('rewardRates', [
      pool.rewardToken,
      pool.duration,
    ]),
  }));

  const results = await withRpcTimeout(
    multicall.aggregate3.staticCall(calls),
    'rewardRates.multicall',
    APY_FETCH_TIMEOUT_MS,
  );

  return STAKING_POOLS.map((pool, i) => {
    const row = results[i];
    if (!row?.success || !row.returnData || row.returnData === '0x') {
      return { ...pool, apy: null };
    }
    try {
      const [rate] = REWARD_RATES_IFACE.decodeFunctionResult('rewardRates', row.returnData);
      return { ...pool, apy: Number(rate) };
    } catch {
      return { ...pool, apy: null };
    }
  });
}

/** Fallback: individual rewardRates (still try each RPC once). */
async function loadPoolApysIndividual(provider) {
  const contract = getStakingContract(provider);
  return Promise.all(
    STAKING_POOLS.map(async (pool) => {
      try {
        const rate = await withRpcTimeout(
          contract.rewardRates(pool.rewardToken, pool.duration),
          'rewardRates',
          RPC_CALL_TIMEOUT_MS,
        );
        return { ...pool, apy: Number(rate) };
      } catch {
        return { ...pool, apy: null };
      }
    }),
  );
}

async function loadPoolApys() {
  const urls = getRpcUrlList();
  // Prefer direct RPCs (publicnode is usually healthy); shared FallbackProvider last.
  const providers = [
    ...urls.map((url) => createStaticProvider(url)),
    getProvider(),
  ];

  let best = STAKING_POOLS.map((p) => ({ ...p, apy: null }));

  for (const provider of providers) {
    try {
      const pools = await loadPoolApysViaMulticall(provider);
      if (poolsHaveAnyApy(pools)) {
        apyCache = pools;
        apyCacheAt = Date.now();
        return pools;
      }
      best = pools;
    } catch {
      /* try next */
    }

    try {
      const pools = await loadPoolApysIndividual(provider);
      if (poolsHaveAnyApy(pools)) {
        apyCache = pools;
        apyCacheAt = Date.now();
        return pools;
      }
      best = pools;
    } catch {
      /* try next */
    }
  }

  // Do not cache a total failure — next open of Stake should retry immediately
  if (poolsHaveAnyApy(best)) {
    apyCache = best;
    apyCacheAt = Date.now();
  }
  return best;
}

export async function fetchPoolApys({ force = false } = {}) {
  if (!force && getCachedPoolApys()) {
    return apyCache;
  }
  if (!force && apyInflight) {
    return apyInflight;
  }

  apyInflight = loadPoolApys().finally(() => {
    apyInflight = null;
  });
  return apyInflight;
}

export function clearPoolApyCache() {
  apyCache = null;
  apyCacheAt = 0;
  apyInflight = null;
}

export function clearStakeCaches() {
  clearPoolApyCache();
  approvalCache.clear();
}

export async function checkVdoApproval(owner, signer = null) {
  if (!owner) return false;
  const cached = getCachedVdoApproval(owner);
  if (cached !== null) return cached;

  try {
    const vdo = getVdoContract(signer || getProvider());
    const allowance = await withRpcTimeout(
      vdo.allowance(owner, STAKING_ADDRESS),
      'allowance',
    );
    const ok = allowance > 0n;
    cacheApproval(owner, ok);
    return ok;
  } catch {
    return false;
  }
}

export function prefetchStakeData(address) {
  if (!address) return Promise.resolve();
  return Promise.all([
    fetchPoolApys(),
    checkVdoApproval(address),
  ]).then(() => undefined);
}

export function rememberVdoApproval(owner, ok) {
  cacheApproval(owner, ok);
}

export async function estimateApproveGas(signer) {
  const vdo = getVdoContract(signer);
  const gas = await vdo.approve.estimateGas(STAKING_ADDRESS, MaxUint256);
  return gas;
}

/** Real PLS coverage for approve (live gas × price + buffer). */
export async function checkApprovePlsFunds(signer) {
  const vdo = getVdoContract(signer);
  return checkPlsCoverage(signer, {
    valueWei: 0n,
    estimateFn: () => vdo.approve.estimateGas(STAKING_ADDRESS, MaxUint256),
    fallbackGasLimit: FALLBACK_GAS_LIMITS.approve,
  });
}

/** Real PLS coverage for stake. */
export async function checkStakePlsFunds(signer, amount, rewardToken, duration) {
  const contract = getStakingContract(signer);
  const parsed = parseUnits(String(amount), 18);
  return checkPlsCoverage(signer, {
    valueWei: 0n,
    estimateFn: () => contract.stake.estimateGas(parsed, rewardToken, duration),
    fallbackGasLimit: FALLBACK_GAS_LIMITS.stake,
  });
}

/** Real PLS coverage for unstake. */
export async function checkUnstakePlsFunds(signer, stakingIndex) {
  const contract = getStakingContract(signer);
  return checkPlsCoverage(signer, {
    valueWei: 0n,
    estimateFn: () => contract.unstake.estimateGas(stakingIndex),
    fallbackGasLimit: FALLBACK_GAS_LIMITS.unstake,
  });
}

export async function approveVdo(signer) {
  const vdo = getVdoContract(signer);
  return runWithGasCheck(
    signer,
    () => vdo.approve.estimateGas(STAKING_ADDRESS, MaxUint256),
    async () => {
      const tx = await vdo.approve(STAKING_ADDRESS, MaxUint256);
      await tx.wait();
      return tx.hash;
    },
  );
}

export async function stakeVdo(signer, amount, rewardToken, duration) {
  const contract = getStakingContract(signer);
  const parsed = parseUnits(String(amount), 18);
  return runWithGasCheck(
    signer,
    () => contract.stake.estimateGas(parsed, rewardToken, duration),
    async () => {
      const tx = await contract.stake(parsed, rewardToken, duration);
      await tx.wait();
      return tx.hash;
    },
  );
}

export async function unstakeVdo(signer, stakingIndex) {
  const contract = getStakingContract(signer);
  return runWithGasCheck(
    signer,
    () => contract.unstake.estimateGas(stakingIndex),
    async () => {
      const tx = await contract.unstake(stakingIndex);
      await tx.wait();
      return tx.hash;
    },
  );
}

export async function fetchUserStakes(userAddress) {
  if (!userAddress) return [];
  try {
    const contract = getStakingContract();
    const stakes = await contract.getAllUserStakings(userAddress);
    return stakes.map((s, idx) => ({
      index: idx,
      amount: formatUnits(s.amount, 18),
      stakeTime: Number(s.stakeTime),
      lockDuration: Number(s.lockDuration),
      rewardType: Number(s.rewardType),
      isStaked: Boolean(s.isStaked),
      unlockAt: Number(s.stakeTime) + Number(s.lockDuration),
    }));
  } catch {
    return [];
  }
}

export function filterStakesForPool(stakes, pool) {
  const rewardToken = Number(pool.rewardToken);
  const duration = Number(pool.duration);
  return stakes.filter(
    (s) => s.isStaked
      && Number(s.rewardType) === rewardToken
      && Number(s.lockDuration) === duration,
  );
}

export function formatTimeLeft(seconds) {
  if (seconds <= 0) return 'Ready';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}