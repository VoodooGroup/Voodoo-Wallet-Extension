export function normalizeTokenAddress(address) {
  return (address || '').toLowerCase();
}

/**
 * Starred tokens float to the top (most recently starred first).
 * Unstarred keep a stable relative order — do not re-sort by balance on every
 * refresh (that caused the Home list to jump while balances loaded).
 */
export function sortTokensForDisplay(tokens = [], starredAddresses = []) {
  const order = new Map(
    starredAddresses.map((addr, index) => [normalizeTokenAddress(addr), index]),
  );

  return [...tokens]
    .map((tok, index) => ({ tok, index }))
    .sort((a, b) => {
      const aAddr = normalizeTokenAddress(a.tok.address);
      const bAddr = normalizeTokenAddress(b.tok.address);
      const aStar = order.has(aAddr);
      const bStar = order.has(bAddr);

      if (aStar && bStar) {
        return (order.get(aAddr) ?? 0) - (order.get(bAddr) ?? 0);
      }
      if (aStar !== bStar) return aStar ? -1 : 1;

      // Preserve original list order for unstarred tokens (stable, no flicker).
      return a.index - b.index;
    })
    .map(({ tok }) => tok);
}

export function toggleStarredAddress(starredAddresses = [], tokenAddress) {
  const addr = normalizeTokenAddress(tokenAddress);
  if (!addr) return starredAddresses;

  if (starredAddresses.some((entry) => normalizeTokenAddress(entry) === addr)) {
    return starredAddresses.filter((entry) => normalizeTokenAddress(entry) !== addr);
  }

  return [addr, ...starredAddresses.filter((entry) => normalizeTokenAddress(entry) !== addr)];
}

export function isTokenStarred(starredAddresses = [], tokenAddress) {
  const addr = normalizeTokenAddress(tokenAddress);
  return starredAddresses.some((entry) => normalizeTokenAddress(entry) === addr);
}