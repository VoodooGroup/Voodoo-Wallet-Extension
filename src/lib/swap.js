import { Contract, formatUnits, MaxUint256, parseEther, parseUnits } from 'ethers';
import { getProvider } from './chain.js';
import {
  checkPlsCoverage,
  FALLBACK_GAS_LIMITS,
  runWithGasCheck,
} from './gas.js';
import { buildSwapPaths } from './swap-paths.js';
import {
  DEFAULT_SLIPPAGE_BPS,
  SWAP_DEADLINE_SEC,
  SWAP_ROUTER_ABI,
  SWAP_ROUTERS,
} from '../config/swap.js';
import { ERC20_ABI } from '../config/pulsechain.js';
import { withOnChainDecimals } from './token-decimals.js';

export {
  buildSwapTokenList,
  canQuoteSwapAmount,
  findSwapToken,
  formatSwapUiAmount,
  sanitizeSwapAmountInput,
} from './swap-tokens.js';

const SWAP_QUOTE_TIMEOUT_MS = 6_000;

function withSwapQuoteTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), SWAP_QUOTE_TIMEOUT_MS);
    }),
  ]);
}

async function quoteExactIn(router, path, parsedIn, fromToken, toToken) {
  const contract = new Contract(router.address, SWAP_ROUTER_ABI, getProvider());
  const amounts = await withSwapQuoteTimeout(
    contract.getAmountsOut(parsedIn, path),
    'Swap quote',
  );
  const amountOut = amounts[amounts.length - 1];
  const fromDec = fromToken.decimals ?? 18;
  const toDec = toToken.decimals ?? 18;
  return {
    router,
    path,
    exactOut: false,
    amountIn: parsedIn,
    amountInFormatted: formatUnits(parsedIn, fromDec),
    amountOut,
    amountOutFormatted: formatUnits(amountOut, toDec),
    fromDecimals: fromDec,
    toDecimals: toDec,
  };
}

async function quoteExactOut(router, path, parsedOut, fromToken, toToken) {
  const contract = new Contract(router.address, SWAP_ROUTER_ABI, getProvider());
  const amounts = await withSwapQuoteTimeout(
    contract.getAmountsIn(parsedOut, path),
    'Swap quote in',
  );
  const amountIn = amounts[0];
  const fromDec = fromToken.decimals ?? 18;
  const toDec = toToken.decimals ?? 18;
  return {
    router,
    path,
    exactOut: true,
    amountIn,
    amountInFormatted: formatUnits(amountIn, fromDec),
    amountOut: parsedOut,
    amountOutFormatted: formatUnits(parsedOut, toDec),
    fromDecimals: fromDec,
    toDecimals: toDec,
  };
}

/**
 * Best route quote.
 * - exact-in  (default): pass amountIn  → max amountOut
 * - exact-out: pass amountOut + exactOut:true → min amountIn
 *
 * Always resolves ERC-20 decimals on-chain (cached) so wrong stored/config
 * decimals (custom tokens or stale config) cannot corrupt amounts.
 */
export async function getBestSwapQuote({
  amountIn,
  amountOut,
  fromToken,
  toToken,
  exactOut = false,
}) {
  if (!fromToken || !toToken || fromToken.key === toToken.key) return null;

  const [from, to] = await Promise.all([
    withOnChainDecimals(fromToken),
    withOnChainDecimals(toToken),
  ]);

  const paths = buildSwapPaths(from, to);
  if (!paths.length) return null;

  if (exactOut) {
    let parsedOut;
    try {
      parsedOut = parseUnits(String(amountOut), to.decimals);
    } catch {
      return null;
    }
    if (parsedOut <= 0n) return null;

    const attempts = SWAP_ROUTERS.flatMap((router) => paths.map((path) => (
      quoteExactOut(router, path, parsedOut, from, to).catch(() => null)
    )));
    const results = await Promise.all(attempts);
    return results.reduce((best, q) => {
      if (!q) return best;
      if (!best || q.amountIn < best.amountIn) return q;
      return best;
    }, null);
  }

  let parsedIn;
  try {
    parsedIn = parseUnits(String(amountIn), from.decimals);
  } catch {
    return null;
  }
  if (parsedIn <= 0n) return null;

  const attempts = SWAP_ROUTERS.flatMap((router) => paths.map((path) => (
    quoteExactIn(router, path, parsedIn, from, to).catch(() => null)
  )));
  const results = await Promise.all(attempts);
  return results.reduce((best, q) => {
    if (!q) return best;
    if (!best || q.amountOut > best.amountOut) return q;
    return best;
  }, null);
}

export function applySwapSlippage(amountOut, slippageBps = DEFAULT_SLIPPAGE_BPS) {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n;
}

export function applySwapSlippageOnInput(amountIn, slippageBps = DEFAULT_SLIPPAGE_BPS) {
  return (amountIn * BigInt(10000 + slippageBps)) / 10000n;
}

export async function checkSwapApproval(owner, tokenAddress, routerAddress) {
  const token = new Contract(tokenAddress, ERC20_ABI, getProvider());
  const allowance = await token.allowance(owner, routerAddress);
  return allowance > 0n;
}

export async function approveTokenForSwap(signer, tokenAddress, routerAddress) {
  const token = new Contract(tokenAddress, ERC20_ABI, signer);
  return runWithGasCheck(
    signer,
    () => token.approve.estimateGas(routerAddress, MaxUint256),
    async () => {
      const tx = await token.approve(routerAddress, MaxUint256);
      await tx.wait();
      return tx.hash;
    },
  );
}

function buildSwapEstimateFn({
  router, fromToken, toToken, parsedIn, parsedOut, minOut, maxIn, path, to, deadline, exactOut,
}) {
  if (exactOut) {
    if (fromToken.isNative) {
      return () => router.swapETHForExactTokens.estimateGas(
        parsedOut, path, to, deadline, { value: maxIn },
      );
    }
    if (toToken.isNative) {
      return () => router.swapTokensForExactETH.estimateGas(
        parsedOut, maxIn, path, to, deadline,
      );
    }
    return () => router.swapTokensForExactTokens.estimateGas(
      parsedOut, maxIn, path, to, deadline,
    );
  }
  if (fromToken.isNative) {
    return () => router.swapExactETHForTokens.estimateGas(
      minOut, path, to, deadline, { value: parsedIn },
    );
  }
  if (toToken.isNative) {
    return () => router.swapExactTokensForETH.estimateGas(parsedIn, minOut, path, to, deadline);
  }
  return () => router.swapExactTokensForTokens.estimateGas(parsedIn, minOut, path, to, deadline);
}

function resolveParsedIn(quote, amountIn, fromToken) {
  if (quote?.amountIn != null) return BigInt(quote.amountIn);
  const dec = quote?.fromDecimals ?? fromToken.decimals ?? 18;
  return parseUnits(String(amountIn), dec);
}

/**
 * Preflight PLS coverage for a swap (amount + live gas, or gas-only for ERC20).
 */
export async function checkSwapPlsFunds({
  signer, quote, amountIn, fromToken, toToken, slippageBps = DEFAULT_SLIPPAGE_BPS,
}) {
  let valueWei = 0n;
  try {
    if (fromToken.isNative) valueWei = parseEther(String(amountIn));
  } catch {
    return { ok: false, blocker: null };
  }

  if (!quote?.router?.address || !quote?.path || quote.amountOut == null) {
    return checkPlsCoverage(signer, {
      valueWei,
      estimateFn: null,
      fallbackGasLimit: FALLBACK_GAS_LIMITS.swap,
    });
  }

  const router = new Contract(quote.router.address, SWAP_ROUTER_ABI, signer);
  const exactOut = Boolean(quote.exactOut);
  let parsedIn;
  let parsedOut;
  try {
    parsedIn = resolveParsedIn(quote, amountIn, fromToken);
    parsedOut = BigInt(quote.amountOut);
  } catch {
    return { ok: false, blocker: null };
  }
  const maxIn = exactOut ? applySwapSlippageOnInput(parsedIn, slippageBps) : parsedIn;
  if (fromToken.isNative) valueWei = exactOut ? maxIn : parsedIn;
  const minOut = exactOut ? parsedOut : applySwapSlippage(parsedOut, slippageBps);
  const deadline = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SEC;
  const to = await signer.getAddress();
  const estimateFn = buildSwapEstimateFn({
    router,
    fromToken,
    toToken,
    parsedIn,
    parsedOut,
    minOut,
    maxIn,
    path: quote.path,
    to,
    deadline,
    exactOut,
  });

  return checkPlsCoverage(signer, {
    valueWei,
    estimateFn,
    fallbackGasLimit: FALLBACK_GAS_LIMITS.swap,
  });
}

export async function checkApprovePlsFunds(signer, tokenAddress, routerAddress) {
  const token = new Contract(tokenAddress, ERC20_ABI, signer);
  return checkPlsCoverage(signer, {
    valueWei: 0n,
    estimateFn: () => token.approve.estimateGas(routerAddress, MaxUint256),
    fallbackGasLimit: FALLBACK_GAS_LIMITS.approve,
  });
}

export async function executeSwap({
  signer,
  quote,
  amountIn,
  fromToken,
  toToken,
  slippageBps = DEFAULT_SLIPPAGE_BPS,
  recipient,
}) {
  const router = new Contract(quote.router.address, SWAP_ROUTER_ABI, signer);
  const exactOut = Boolean(quote.exactOut);
  const parsedIn = resolveParsedIn(quote, amountIn, fromToken);
  const parsedOut = BigInt(quote.amountOut);
  const minOut = exactOut ? parsedOut : applySwapSlippage(parsedOut, slippageBps);
  const maxIn = exactOut ? applySwapSlippageOnInput(parsedIn, slippageBps) : parsedIn;
  const deadline = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SEC;
  const to = recipient || await signer.getAddress();
  const estimateFn = buildSwapEstimateFn({
    router,
    fromToken,
    toToken,
    parsedIn,
    parsedOut,
    minOut,
    maxIn,
    path: quote.path,
    to,
    deadline,
    exactOut,
  });

  if (exactOut) {
    if (fromToken.isNative) {
      return runWithGasCheck(signer, estimateFn, async () => {
        const tx = await router.swapETHForExactTokens(
          parsedOut, quote.path, to, deadline, { value: maxIn },
        );
        await tx.wait();
        return tx.hash;
      });
    }
    if (toToken.isNative) {
      return runWithGasCheck(signer, estimateFn, async () => {
        const tx = await router.swapTokensForExactETH(
          parsedOut, maxIn, quote.path, to, deadline,
        );
        await tx.wait();
        return tx.hash;
      });
    }
    return runWithGasCheck(signer, estimateFn, async () => {
      const tx = await router.swapTokensForExactTokens(
        parsedOut, maxIn, quote.path, to, deadline,
      );
      await tx.wait();
      return tx.hash;
    });
  }

  if (fromToken.isNative) {
    return runWithGasCheck(signer, estimateFn, async () => {
      const tx = await router.swapExactETHForTokens(
        minOut, quote.path, to, deadline, { value: parsedIn },
      );
      await tx.wait();
      return tx.hash;
    });
  }

  if (toToken.isNative) {
    return runWithGasCheck(signer, estimateFn, async () => {
      const tx = await router.swapExactTokensForETH(
        parsedIn, minOut, quote.path, to, deadline,
      );
      await tx.wait();
      return tx.hash;
    });
  }

  return runWithGasCheck(signer, estimateFn, async () => {
    const tx = await router.swapExactTokensForTokens(
      parsedIn, minOut, quote.path, to, deadline,
    );
    await tx.wait();
    return tx.hash;
  });
}
