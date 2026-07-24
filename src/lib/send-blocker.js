import { formatEther } from 'ethers';
import { classifyTxError } from './tx-errors.js';

function fmtPls(wei) {
  return Number(formatEther(wei)).toFixed(6);
}

function blockerFromClassification(classified) {
  if (classified.type === 'insufficient_transfer' && classified.have != null) {
    const have = BigInt(classified.have);
    const want = BigInt(classified.want);
    const shortfall = want > have ? want - have : 0n;
    return {
      reason: 'insufficient_pls',
      tokenSymbol: 'PLS',
      plsBalance: fmtPls(have),
      plsRequired: fmtPls(want),
      shortfallPls: fmtPls(shortfall),
      includesGas: true,
    };
  }
  if (classified.type === 'insufficient_transfer' || classified.type === 'insufficient_gas') {
    return {
      reason: classified.type === 'insufficient_gas' ? 'insufficient_gas' : 'insufficient_pls',
      tokenSymbol: 'PLS',
      includesGas: classified.type === 'insufficient_transfer',
    };
  }
  return { reason: 'generic' };
}

export function blockerFromError(error) {
  return blockerFromClassification(classifyTxError(error));
}

export function parseSendBlocker(error, t) {
  const blocker = blockerFromError(error);
  if (blocker.reason === 'insufficient_pls' && blocker.plsBalance != null) {
    return { ...blocker, hint: t('send_blocked_hint_pls') };
  }
  if (blocker.reason === 'insufficient_pls' || blocker.reason === 'insufficient_gas') {
    return {
      ...blocker,
      hint: t('send_blocked_hint_pls'),
      body: blocker.reason === 'insufficient_gas'
        ? t('send_blocked_insufficient_gas_body')
        : t('send_blocked_insufficient_pls_body'),
    };
  }
  return {
    reason: 'generic',
    title: t('send_blocked_title'),
    body: t('error_tx_failed_generic'),
    hint: null,
  };
}