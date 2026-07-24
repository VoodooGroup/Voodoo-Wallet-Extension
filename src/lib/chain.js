import {
  FallbackProvider, JsonRpcProvider, Contract, formatEther, formatUnits, parseEther, parseUnits,
} from 'ethers';
import { PULSECHAIN, DEFAULT_TOKENS, ERC20_ABI } from '../config/pulsechain';
import { PULSECHAIN_RPC_URLS } from '../config/rpc.js';

let provider;
let providerUrlsKey = '';

/** Public PulseChain RPCs can be slow — keep a bounded timeout (avoid multi-minute hangs). */
const RPC_CALL_TIMEOUT_MS = 8_000;
const RPC_STALL_TIMEOUT_MS = 1_500;

function getRpcUrls() {
  if (PULSECHAIN_RPC_URLS.length) return PULSECHAIN_RPC_URLS;
  if (PULSECHAIN.rpcUrls?.length) return PULSECHAIN.rpcUrls;
  return [PULSECHAIN.rpcUrl];
}

function createJsonRpcProvider(url) {
  return new JsonRpcProvider(url, PULSECHAIN.id, { staticNetwork: true });
}

function withRpcTimeout(promise, label, ms = RPC_CALL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]);
}

export function getProvider() {
  const urls = getRpcUrls();
  const key = urls.join('|');
  if (!provider || providerUrlsKey !== key) {
    providerUrlsKey = key;
    provider = new FallbackProvider(
      urls.map((url, priority) => ({
        provider: createJsonRpcProvider(url),
        priority,
        stallTimeout: RPC_STALL_TIMEOUT_MS,
        weight: 1,
      })),
      PULSECHAIN.id,
    );
  }
  return provider;
}

/** Reset cached provider (e.g. after prolonged RPC failures). */
export function resetProvider() {
  provider = null;
  providerUrlsKey = '';
}

/**
 * Call via shared FallbackProvider; on failure try one alternate URL once.
 * Keeps worst-case latency low so Home refresh cannot spin forever.
 */
async function rpcCall(label, callFn, ms = RPC_CALL_TIMEOUT_MS) {
  try {
    return await withRpcTimeout(callFn(getProvider()), label, ms);
  } catch (primaryErr) {
    const urls = getRpcUrls();
    // Prefer a different endpoint than the first (FallbackProvider already tried them).
    const alt = urls.length > 1 ? urls[urls.length - 1] : urls[0];
    if (!alt) {
      throw primaryErr instanceof Error ? primaryErr : new Error(`${label} timed out`);
    }
    try {
      return await withRpcTimeout(callFn(createJsonRpcProvider(alt)), label, Math.min(ms, 6_000));
    } catch (err) {
      throw err instanceof Error ? err : primaryErr;
    }
  }
}

export async function getPlsBalance(address) {
  const bal = await rpcCall('plsBalance', (p) => p.getBalance(address));
  return formatEther(bal);
}

function placeholderToken(token, tokenLogos = {}) {
  const key = (token.address || '').toLowerCase();
  const logoData = tokenLogos[key] || token.logoData;
  return {
    address: token.address,
    symbol: token.symbol || '???',
    name: token.name || token.symbol || 'Token',
    decimals: Number(token.decimals ?? 18),
    balance: '0',
    raw: '0',
    logo: token.logo,
    logoData,
    isCustom: Boolean(token.isCustom),
  };
}

/** Build the Home list immediately (balances filled in later). */
export function buildTokenListSkeleton(customTokens = [], tokenLogos = {}) {
  const tokenList = DEFAULT_TOKENS.map((t) => ({ ...t }));

  customTokens.forEach((custom) => {
    const key = (custom.address || '').toLowerCase();
    if (!key) return;
    const existing = tokenList.find((x) => x.address.toLowerCase() === key);
    if (existing) {
      // Never let stored custom metadata overwrite official/core decimals or identity —
      // wrong decimals in storage previously broke POISON (9 vs 18).
      Object.assign(existing, {
        logo: custom.logo || existing.logo,
        logoData: tokenLogos[key] || custom.logoData || existing.logoData,
        isCustom: Boolean(custom.isCustom),
      });
    } else {
      tokenList.push({
        ...custom,
        logoData: tokenLogos[key] || custom.logoData,
      });
    }
  });

  return tokenList.map((t) => placeholderToken(t, tokenLogos));
}

export async function getTokenBalance(tokenAddress, walletAddress) {
  const [raw, decimals, symbol, name] = await Promise.all([
    rpcCall('balanceOf', (p) => new Contract(tokenAddress, ERC20_ABI, p).balanceOf(walletAddress)),
    rpcCall('decimals', (p) => new Contract(tokenAddress, ERC20_ABI, p).decimals()),
    rpcCall('symbol', (p) => new Contract(tokenAddress, ERC20_ABI, p).symbol()),
    rpcCall('name', (p) => new Contract(tokenAddress, ERC20_ABI, p).name()),
  ]);
  return {
    address: tokenAddress,
    symbol,
    name,
    decimals: Number(decimals),
    balance: formatUnits(raw, decimals),
    raw: raw.toString(),
  };
}

async function fetchKnownTokenBalance(token, walletAddress, tokenLogos) {
  const key = token.address.toLowerCase();
  const logoData = tokenLogos[key] || token.logoData;
  const configuredDecimals = Number(token.decimals ?? 18);

  try {
    const contractCall = (p) => new Contract(token.address, ERC20_ABI, p);
    // Always read on-chain decimals — static config can be wrong (POISON is 9, not 18)
    const [raw, onChainDecimals] = await Promise.all([
      rpcCall('balanceOf', (p) => contractCall(p).balanceOf(walletAddress)),
      rpcCall('decimals', (p) => contractCall(p).decimals()).catch(() => configuredDecimals),
    ]);
    const decimals = Number(onChainDecimals ?? configuredDecimals);
    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name || token.symbol,
      decimals,
      balance: formatUnits(raw, decimals),
      raw: raw.toString(),
      logo: token.logo,
      logoData,
      isCustom: token.isCustom || false,
    };
  } catch {
    return placeholderToken(token, tokenLogos);
  }
}

export async function fetchAllBalances(address, customTokens = [], tokenLogos = {}) {
  if (!address) {
    return {
      pls: '0',
      tokens: buildTokenListSkeleton(customTokens, tokenLogos),
      plsStale: false,
    };
  }

  const skeleton = buildTokenListSkeleton(customTokens, tokenLogos);

  const [plsResult, tokens] = await Promise.all([
    getPlsBalance(address).then(
      (pls) => ({ ok: true, pls }),
      (err) => ({ ok: false, err }),
    ),
    Promise.all(
      skeleton.map((t) => (
        t.symbol && t.symbol !== '???' && t.decimals != null
          ? fetchKnownTokenBalance(t, address, tokenLogos)
          : getTokenBalance(t.address, address).then((bal) => ({
            ...bal,
            logo: t.logo,
            logoData: tokenLogos[t.address.toLowerCase()] || t.logoData,
            isCustom: t.isCustom || false,
          })).catch(() => placeholderToken(t, tokenLogos))
      )),
    ),
  ]);

  // Always return the token rows — never leave Home with an empty list after a fetch attempt.
  if (!plsResult.ok) {
    return {
      pls: null,
      tokens: tokens.length ? tokens : skeleton,
      plsStale: true,
      plsError: plsResult.err,
    };
  }

  return {
    pls: plsResult.pls,
    tokens: tokens.length ? tokens : skeleton,
    plsStale: false,
  };
}

export async function estimateGasSend({ signer, to, amount, isNative, tokenAddress, decimals = 18 }) {
  if (isNative) {
    const tx = { to, value: parseEther(amount) };
    const gas = await signer.estimateGas(tx);
    const fee = await getProvider().getFeeData();
    return {
      gasLimit: gas.toString(),
      gasPrice: fee.gasPrice?.toString() || '0',
      maxFeePerGas: fee.maxFeePerGas?.toString() || null,
    };
  }
  const { getErc20Decimals } = await import('./token-decimals.js');
  const resolvedDecimals = await getErc20Decimals(tokenAddress, decimals);
  const contract = new Contract(tokenAddress, ERC20_ABI, signer);
  const parsed = parseUnits(amount, resolvedDecimals);
  const gas = await contract.transfer.estimateGas(to, parsed);
  const fee = await getProvider().getFeeData();
  return {
    gasLimit: gas.toString(),
    gasPrice: fee.gasPrice?.toString() || '0',
    maxFeePerGas: fee.maxFeePerGas?.toString() || null,
  };
}

export async function sendNative(signer, to, amount) {
  const tx = await signer.sendTransaction({ to, value: parseEther(amount) });
  await tx.wait();
  return tx.hash;
}

export async function sendToken(signer, tokenAddress, to, amount, decimals = 18) {
  // Always use on-chain decimals — never trust UI/storage alone (custom tokens)
  const { getErc20Decimals } = await import('./token-decimals.js');
  const resolvedDecimals = await getErc20Decimals(tokenAddress, decimals);
  const contract = new Contract(tokenAddress, ERC20_ABI, signer);
  const tx = await contract.transfer(to, parseUnits(amount, resolvedDecimals));
  await tx.wait();
  return tx.hash;
}
