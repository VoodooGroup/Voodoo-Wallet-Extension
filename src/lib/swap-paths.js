import { WPLS_ADDRESS } from '../config/swap.js';

export function swapPathAddress(token, wpls = WPLS_ADDRESS) {
  if (!token || token.isNative || token.symbol === 'PLS') return wpls;
  return token.address;
}

/** Direct pair + route via WPLS when needed */
export function buildSwapPaths(fromToken, toToken, wpls = WPLS_ADDRESS) {
  const a = swapPathAddress(fromToken, wpls);
  const b = swapPathAddress(toToken, wpls);
  if (!a || !b || a.toLowerCase() === b.toLowerCase()) return [];

  const paths = [[a, b]];
  const wplsLower = wpls.toLowerCase();
  if (a.toLowerCase() !== wplsLower && b.toLowerCase() !== wplsLower) {
    paths.push([a, wpls, b]);
  }
  return paths;
}