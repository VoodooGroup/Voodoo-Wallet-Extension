import { formatEther } from 'ethers';
import { getProvider } from './chain';

const MIN_PLS_GAS = 500_000_000_000_000n; // ~0.0005 PLS buffer

export function formatTxError(error) {
  const msg = error?.shortMessage || error?.message || String(error);
  const code = error?.code || '';

  if (
    code === 'INSUFFICIENT_FUNDS'
    || msg.includes('INSUFFICIENT_FUNDS')
    || msg.includes('insufficient funds')
    || msg.includes('insufficient balance')
  ) {
    return 'Not enough PLS for gas. Add Pulse (PLS) to your wallet to pay transaction fees.';
  }
  if (msg.includes('user rejected') || code === 'ACTION_REJECTED') {
    return 'Transaction cancelled.';
  }
  if (msg.includes('nonce')) {
    return 'Transaction nonce error — try again in a few seconds.';
  }
  return msg.replace(/^execution reverted:?\s*/i, '').slice(0, 200) || 'Transaction failed';
}

export async function estimateGasCostWei(signer, estimateFn) {
  const gasLimit = await estimateFn();
  const fee = await getProvider().getFeeData();
  const gasPrice = fee.gasPrice ?? fee.maxFeePerGas ?? 0n;
  return gasLimit * gasPrice;
}

export async function ensurePlsForGas(signer, costWei) {
  const address = await signer.getAddress();
  const balance = await getProvider().getBalance(address);
  const required = costWei + MIN_PLS_GAS;
  if (balance < required) {
    const need = formatEther(required - balance);
    const have = formatEther(balance);
    throw new Error(
      `Not enough PLS for gas. Balance: ${Number(have).toFixed(6)} PLS — need ~${Number(need).toFixed(6)} more PLS for fees.`,
    );
  }
}

export async function runWithGasCheck(signer, estimateFn, sendFn) {
  const cost = await estimateGasCostWei(signer, estimateFn);
  await ensurePlsForGas(signer, cost);
  return sendFn();
}