import { formatEther } from 'ethers';
import { DEFAULT_TOKENS } from '../config/pulsechain.js';
import { STAKING_POOLS } from '../config/staking.js';

export const YIELD_SYMBOLS = new Set(['MAGIC', 'POISON']);
export const GAS_TX_LIMIT = 25;

export function formatTimeLeft(seconds) {
  if (seconds <= 0) return 'Ready';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export function getStakePool(stake) {
  return STAKING_POOLS.find(
    (pool) => Number(pool.rewardToken) === Number(stake.rewardType)
      && Number(pool.duration) === Number(stake.lockDuration),
  ) || null;
}

export function buildUpcomingUnlocks(stakes, nowSec = Math.floor(Date.now() / 1000)) {
  return stakes
    .filter((stake) => stake.isStaked)
    .map((stake) => {
      const pool = getStakePool(stake);
      const secondsLeft = stake.unlockAt - nowSec;
      return {
        id: String(stake.index),
        amount: stake.amount,
        rewardLabel: pool?.rewardLabel || '—',
        lockupDays: pool?.lockupDays || null,
        unlockAt: stake.unlockAt,
        ready: secondsLeft <= 0,
        timeLeft: formatTimeLeft(Math.max(0, secondsLeft)),
        secondsLeft,
      };
    })
    .sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      return a.secondsLeft - b.secondsLeft;
    });
}

export function calcTxGasFee(tx) {
  try {
    const used = BigInt(tx.gasUsed || '0');
    const price = BigInt(tx.gasPrice || tx.effectiveGasPrice || '0');
    if (used === 0n || price === 0n) return 0n;
    return used * price;
  } catch {
    return 0n;
  }
}

export function buildGasSpending(rows, walletAddress) {
  const wallet = walletAddress.toLowerCase();
  const items = [];
  let totalWei = 0n;

  for (const tx of rows) {
    if ((tx.from || '').toLowerCase() !== wallet) continue;
    const feeWei = calcTxGasFee(tx);
    if (feeWei === 0n) continue;
    totalWei += feeWei;
    items.push({
      id: tx.hash,
      hash: tx.hash,
      feePls: formatEther(feeWei),
      timestamp: Number(tx.timeStamp || 0) * 1000,
      status: tx.txreceipt_status === '0' ? 'failed' : 'success',
    });
  }

  return {
    totalPls: formatEther(totalWei),
    txCount: items.length,
    items: items.sort((a, b) => b.timestamp - a.timestamp),
  };
}

function formatTokenAmount(value, decimals) {
  try {
    const raw = BigInt(value || '0');
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const frac = raw % base;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
  } catch {
    return '0';
  }
}

export function buildRecentYields(rows, walletAddress) {
  const wallet = walletAddress.toLowerCase();
  return rows
    .filter((tx) => {
      const symbol = String(tx.tokenSymbol || '').toUpperCase();
      const to = (tx.to || '').toLowerCase();
      return YIELD_SYMBOLS.has(symbol) && to === wallet;
    })
    .map((tx) => ({
      id: `${tx.hash}-${tx.logIndex ?? tx.transactionIndex ?? '0'}`,
      hash: tx.hash,
      symbol: String(tx.tokenSymbol || '').toUpperCase(),
      amount: formatTokenAmount(tx.value, Number(tx.tokenDecimal || 18)),
      timestamp: Number(tx.timeStamp || 0) * 1000,
      from: tx.from,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, GAS_TX_LIMIT);
}

export function yieldTokenContracts() {
  return DEFAULT_TOKENS
    .filter((token) => YIELD_SYMBOLS.has(token.symbol))
    .map((token) => token.address);
}