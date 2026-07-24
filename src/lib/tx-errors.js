import { formatEther } from 'ethers';

function errorMessage(error) {
  if (typeof error === 'string') return error;
  return [
    error?.shortMessage,
    error?.message,
    error?.info?.error?.message,
  ].filter(Boolean).join('\n');
}

export function stripEthersErrorNoise(msg) {
  let s = String(msg).trim();
  const cut = s.search(/\s*\(transaction=|\s*,\s*info=\{/);
  if (cut > 0) s = s.slice(0, cut);
  return s
    .replace(/,\s*code=[A-Z_0-9-]+,\s*version=[\d.]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function classifyTxError(error) {
  const msg = errorMessage(error);
  const code = error?.code || '';
  const rpcCode = error?.info?.error?.code;

  const insufficient = (
    code === 'INSUFFICIENT_FUNDS'
    || (rpcCode === -32000 && /insufficient funds/i.test(msg))
    || /INSUFFICIENT_FUNDS/i.test(msg)
    || /insufficient funds/i.test(msg)
    || /insufficient balance/i.test(msg)
  );

  if (insufficient) {
    const haveWant = msg.match(/have\s+(\d+)\s+want\s+(\d+)/i);
    if (/gas \* price \+ value/i.test(msg) || haveWant) {
      return {
        type: 'insufficient_transfer',
        have: haveWant?.[1] ?? null,
        want: haveWant?.[2] ?? null,
      };
    }
    return { type: 'insufficient_gas' };
  }

  if (msg.includes('user rejected') || code === 'ACTION_REJECTED') {
    return { type: 'cancelled' };
  }
  if (/nonce/i.test(msg)) {
    return { type: 'nonce' };
  }

  return { type: 'generic', message: stripEthersErrorNoise(msg) };
}

export function formatTxError(error) {
  const classified = classifyTxError(error);

  if (classified.type === 'insufficient_transfer') {
    if (classified.have != null && classified.want != null) {
      const have = Number(formatEther(classified.have)).toFixed(6);
      const want = Number(formatEther(classified.want)).toFixed(6);
      return `Not enough PLS. Balance: ${have} PLS — need ${want} PLS for this transaction (including gas).`;
    }
    return 'Not enough PLS for this transfer and gas fees. Add Pulse (PLS) to your wallet.';
  }
  if (classified.type === 'insufficient_gas') {
    return 'Not enough PLS for gas. Add Pulse (PLS) to your wallet to pay transaction fees.';
  }
  if (classified.type === 'cancelled') {
    return 'Transaction cancelled.';
  }
  if (classified.type === 'nonce') {
    return 'Transaction nonce error — try again in a few seconds.';
  }

  const cleaned = classified.message.replace(/^execution reverted:?\s*/i, '');
  return cleaned.slice(0, 200) || 'Transaction failed';
}

export function formatTxErrorI18n(error, t) {
  const classified = classifyTxError(error);

  if (classified.type === 'insufficient_transfer') {
    if (classified.have != null && classified.want != null) {
      return t('error_insufficient_pls_balance', {
        have: Number(formatEther(classified.have)).toFixed(6),
        want: Number(formatEther(classified.want)).toFixed(6),
      });
    }
    return t('error_insufficient_pls_transfer');
  }
  if (classified.type === 'insufficient_gas') {
    return t('error_insufficient_pls_gas');
  }
  if (classified.type === 'cancelled') {
    return t('error_tx_cancelled');
  }
  if (classified.type === 'nonce') {
    return t('error_tx_nonce');
  }

  return t('error_tx_failed_generic');
}

export function throwInsufficientFunds(haveWei, wantWei) {
  const err = new Error(
    `insufficient funds for gas * price + value: have ${haveWei} want ${wantWei}`,
  );
  err.code = 'INSUFFICIENT_FUNDS';
  throw err;
}