import { formatEther } from 'ethers';
import { getProvider } from './chain.js';
import { throwInsufficientFunds } from './tx-errors.js';

export {
  classifyTxError,
  formatTxError,
  formatTxErrorI18n,
  stripEthersErrorNoise,
  throwInsufficientFunds,
} from './tx-errors.js';

/** Small safety buffer (~0.0005 PLS) so borderline txs still succeed */
export const GAS_BUFFER_WEI = 500_000_000_000_000n;

/** Typical gas limits when eth_estimateGas fails (e.g. zero balance) */
export const FALLBACK_GAS_LIMITS = {
  approve: 80_000n,
  swap: 280_000n,
  stake: 300_000n,
  unstake: 200_000n,
  transfer: 65_000n,
};

export function formatPlsAmount(wei) {
  try {
    return Number(formatEther(wei ?? 0n)).toFixed(6);
  } catch {
    return '0.000000';
  }
}

/**
 * Build the funds-popup payload from real wei figures.
 */
export function buildPlsBlocker({
  balanceWei,
  requiredWei,
  gasWei = 0n,
  valueWei = 0n,
}) {
  const bal = BigInt(balanceWei ?? 0n);
  const req = BigInt(requiredWei ?? 0n);
  const gas = BigInt(gasWei ?? 0n);
  const value = BigInt(valueWei ?? 0n);
  const shortfall = req > bal ? req - bal : 0n;
  const includesValue = value > 0n;

  return {
    reason: includesValue ? 'insufficient_pls' : 'insufficient_gas',
    tokenSymbol: 'PLS',
    plsBalance: formatPlsAmount(bal),
    plsRequired: formatPlsAmount(req),
    shortfallPls: formatPlsAmount(shortfall),
    gasEstimate: gas > 0n ? formatPlsAmount(gas) : null,
    sendAmount: includesValue ? formatPlsAmount(value) : null,
    includesGas: true,
  };
}

export async function getPlsBalanceWei(signerOrAddress) {
  const provider = getProvider();
  if (typeof signerOrAddress === 'string') {
    return provider.getBalance(signerOrAddress);
  }
  const address = await signerOrAddress.getAddress();
  return provider.getBalance(address);
}

export async function getGasPriceWei() {
  const fee = await getProvider().getFeeData();
  return fee.gasPrice ?? fee.maxFeePerGas ?? 0n;
}

/**
 * Prefer live estimateGas; if it fails (common when balance is 0),
 * fall back to typical gas limit × current gas price.
 */
export async function estimateGasCostWeiOrFallback(estimateFn, fallbackGasLimit = FALLBACK_GAS_LIMITS.swap) {
  const gasPrice = await getGasPriceWei();
  if (!gasPrice || gasPrice === 0n) {
    // Extreme fallback ~0.001 PLS so UI never shows 0 needed
    return 1_000_000_000_000_000n;
  }
  try {
    const gasLimit = await estimateFn();
    const limit = BigInt(gasLimit);
    if (limit > 0n) return limit * gasPrice;
  } catch {
    // ignore — use fallback below
  }
  return BigInt(fallbackGasLimit) * gasPrice;
}

export async function estimateGasCostWei(signer, estimateFn) {
  return estimateGasCostWeiOrFallback(estimateFn, FALLBACK_GAS_LIMITS.swap);
}

/**
 * Compare on-chain PLS balance to value + gas + buffer.
 * Returns { ok, blocker?, balanceWei, gasWei, requiredWei, valueWei }.
 */
export async function checkPlsCoverage(signer, {
  valueWei = 0n,
  estimateFn,
  fallbackGasLimit = FALLBACK_GAS_LIMITS.swap,
} = {}) {
  const balanceWei = await getPlsBalanceWei(signer);
  const gasWei = estimateFn
    ? await estimateGasCostWeiOrFallback(estimateFn, fallbackGasLimit)
    : await estimateGasCostWeiOrFallback(
      async () => { throw new Error('no estimate'); },
      fallbackGasLimit,
    );
  const requiredWei = BigInt(valueWei) + gasWei + GAS_BUFFER_WEI;

  if (balanceWei >= requiredWei) {
    return {
      ok: true, balanceWei, gasWei, requiredWei, valueWei: BigInt(valueWei),
    };
  }

  return {
    ok: false,
    balanceWei,
    gasWei,
    requiredWei,
    valueWei: BigInt(valueWei),
    blocker: buildPlsBlocker({
      balanceWei,
      requiredWei,
      gasWei,
      valueWei: BigInt(valueWei),
    }),
  };
}

export async function ensurePlsForGas(signer, costWei) {
  const balance = await getPlsBalanceWei(signer);
  const required = BigInt(costWei) + GAS_BUFFER_WEI;
  if (balance < required) {
    throwInsufficientFunds(balance, required);
  }
}

export async function runWithGasCheck(signer, estimateFn, sendFn) {
  const cost = await estimateGasCostWeiOrFallback(estimateFn, FALLBACK_GAS_LIMITS.swap);
  await ensurePlsForGas(signer, cost);
  return sendFn();
}
