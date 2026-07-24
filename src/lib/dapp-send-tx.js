import { JsonRpcProvider, Wallet } from 'ethers';
import { PULSECHAIN_RPC_URLS } from '../config/rpc.js';
import { PULSECHAIN } from '../config/pulsechain.js';

/**
 * Normalize a dApp eth_sendTransaction param object for ethers v6 Wallet.sendTransaction.
 * Ethers v5 dApps often send { gas, gasPrice, chainId: "0x171" } wire format.
 */
export function normalizeDappTxParams(raw = {}) {
  const out = {};

  if (raw.to) out.to = String(raw.to);

  if (raw.data != null && raw.data !== '' && raw.data !== '0x') {
    out.data = String(raw.data);
  }

  const value = raw.value;
  if (value != null && value !== '' && value !== '0x' && value !== '0x0' && value !== 0 && value !== '0') {
    out.value = value;
  }

  const gas = raw.gasLimit ?? raw.gas;
  if (gas != null && gas !== '') {
    try {
      out.gasLimit = typeof gas === 'bigint' ? gas : BigInt(gas);
    } catch {
      /* leave unset — ethers will estimate */
    }
  }

  // Never reuse dApp nonce — stale nonce is a common reason stake/approve
  // appear to "confirm" in the UI but never land on-chain.
  // Wallet provider will fetch a fresh nonce on send.

  // Do NOT copy gasPrice / maxFee from dApp wire format either — they are often
  // missing or outdated. ethers Wallet will fill fee data from the RPC.
  // (Keeping only gasLimit if the dApp provided a safe fixed limit.)

  // Always PulseChain
  out.chainId = PULSECHAIN.id;

  // Do NOT forward raw.type / from / nonce
  return out;
}

function createSendProvider() {
  const url = PULSECHAIN_RPC_URLS[0] || PULSECHAIN.rpcUrl;
  return new JsonRpcProvider(url, PULSECHAIN.id, { staticNetwork: true });
}

/**
 * Broadcast a dApp transaction with a single JsonRpcProvider.
 * FallbackProvider is fine for reads but unreliable for eth_sendRawTransaction.
 * Returns the transaction hash string (0x…).
 */
export async function sendDappTransaction(signer, rawParams) {
  if (!signer?.privateKey) {
    throw new Error('Wallet locked or no signer');
  }
  const txParams = normalizeDappTxParams(rawParams);
  if (!txParams.to) {
    throw new Error('Transaction missing "to" address');
  }

  // stake(uint256,uint8,uint256) = 0xf99b7d75 — needs more gas than approve
  const dataLc = String(txParams.data || '').toLowerCase();
  const isStake = dataLc.startsWith('0xf99b7d75');
  const isApprove = dataLc.startsWith('0x095ea7b3');
  if (isStake && (txParams.gasLimit == null || txParams.gasLimit < 400_000n)) {
    txParams.gasLimit = 550_000n;
  } else if (isApprove && (txParams.gasLimit == null || txParams.gasLimit < 80_000n)) {
    txParams.gasLimit = 120_000n;
  } else if (txParams.gasLimit == null) {
    txParams.gasLimit = 250_000n;
  }

  let lastErr;
  const urls = PULSECHAIN_RPC_URLS.length
    ? PULSECHAIN_RPC_URLS
    : [PULSECHAIN.rpcUrl];

  for (const url of urls) {
    try {
      const provider = new JsonRpcProvider(url, PULSECHAIN.id, { staticNetwork: true });
      const wallet = new Wallet(signer.privateKey, provider);
      // Fresh nonce from this RPC
      const from = await wallet.getAddress();
      txParams.nonce = await provider.getTransactionCount(from, 'pending');
      const tx = await wallet.sendTransaction(txParams);
      console.info('[Voodoo] dApp tx broadcast', { hash: tx.hash, to: txParams.to, url });
      return { hash: tx.hash, tx };
    } catch (err) {
      lastErr = err;
      console.warn('[Voodoo] dApp send failed on', url, err?.shortMessage || err?.message || err);
      // Drop nonce so next endpoint re-fetches
      delete txParams.nonce;
    }
  }

  // Last resort: original signer provider
  try {
    delete txParams.nonce;
    const tx = await signer.sendTransaction(txParams);
    return { hash: tx.hash, tx };
  } catch (err) {
    throw lastErr || err;
  }
}

export { createSendProvider };
