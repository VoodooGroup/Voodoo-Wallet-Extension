/**
 * ============================================================================
 * TEMP FEATURE — DEV DEMO BALANCE (+$300 for product videos)
 * ============================================================================
 * DISPLAY ONLY. Does not credit real funds on-chain.
 *
 * REMOVE LATER (all touch-points):
 *  1. Delete this file: src/lib/dev-demo-balance.js
 *  2. Remove blocks marked  DEV_DEMO_BALANCE  in:
 *       - src/context/WalletContext.jsx
 *       - src/popup/pages/Settings.jsx
 *  3. Remove keys settings_dev_mode / settings_dev_mode_hint from:
 *       - src/lib/i18n/messages/en.js
 *  4. Optional: chrome.storage.local.remove('voodoo_dev_demo_balance_v1')
 * ============================================================================
 */

export const DEV_DEMO_USD = 300;
export const DEV_DEMO_BALANCE_KEY = 'voodoo_dev_demo_balance_v1';

function assertChrome() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    throw new Error('Chrome extension APIs unavailable.');
  }
}

/** @returns {Promise<boolean>} default false */
export async function getDevDemoBalanceEnabled() {
  assertChrome();
  const result = await chrome.storage.local.get(DEV_DEMO_BALANCE_KEY);
  return Boolean(result[DEV_DEMO_BALANCE_KEY]);
}

export async function setDevDemoBalanceEnabled(enabled) {
  assertChrome();
  await chrome.storage.local.set({ [DEV_DEMO_BALANCE_KEY]: Boolean(enabled) });
}

/**
 * Boost display portfolio by +$300 and add matching token/PLS quantity
 * so Home token rows also show the demo balance.
 *
 * @param {{
 *   enabled: boolean,
 *   portfolioValue: number,
 *   plsBalance: string|number,
 *   tokens: Array<{ symbol?: string, balance?: string|number, address?: string }>,
 *   prices: Record<string, number>,
 * }} input
 */
export function applyDevDemoDisplay({
  enabled,
  portfolioValue,
  plsBalance,
  tokens,
  prices = {},
}) {
  if (!enabled) {
    return {
      portfolioValue,
      plsBalance,
      tokens,
    };
  }

  const targetUsd = DEV_DEMO_USD;
  let nextPls = Number(plsBalance) || 0;
  const nextTokens = (tokens || []).map((tok) => ({ ...tok }));

  const vdoIdx = nextTokens.findIndex((tok) => String(tok.symbol || '').toUpperCase() === 'VDO');
  const vdoPrice = Number(prices.VDO) || 0;
  const plsPrice = Number(prices.PLS) || 0;

  if (vdoIdx >= 0 && vdoPrice > 0) {
    const extra = targetUsd / vdoPrice;
    const cur = Number(nextTokens[vdoIdx].balance) || 0;
    nextTokens[vdoIdx] = {
      ...nextTokens[vdoIdx],
      balance: String(cur + extra),
      // Marker for debugging / future cleanup only
      __devDemoBoost: true,
    };
  } else if (plsPrice > 0) {
    nextPls += targetUsd / plsPrice;
  } else if (vdoIdx >= 0) {
    // No price feed — still show a larger token balance for video screenshots
    const cur = Number(nextTokens[vdoIdx].balance) || 0;
    nextTokens[vdoIdx] = {
      ...nextTokens[vdoIdx],
      balance: String(cur + 25_000),
      __devDemoBoost: true,
    };
  } else {
    nextPls += 10_000;
  }

  return {
    // Always pin portfolio header to real + $300 for clean product shots
    portfolioValue: (Number(portfolioValue) || 0) + targetUsd,
    plsBalance: String(nextPls),
    tokens: nextTokens,
  };
}
