export const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';

/** PulseX V1 + V2 — best quote wins */
export const SWAP_ROUTERS = [
  { id: 'pulsex-v1', label: 'PulseX V1', address: '0x165C3410fC91EF562C50559f7d2289fEbed552d9' },
  { id: 'pulsex-v2', label: 'PulseX V2', address: '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02' },
];

export const SWAP_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
  'function getAmountsIn(uint amountOut, address[] path) view returns (uint[] amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)',
  'function swapETHForExactTokens(uint amountOut, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
  'function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] path, address to, uint deadline) returns (uint[] amounts)',
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] path, address to, uint deadline) returns (uint[] amounts)',
];

export const DEFAULT_SLIPPAGE_BPS = 100;
export const SWAP_DEADLINE_SEC = 1200;
