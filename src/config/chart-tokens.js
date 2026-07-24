import { TOKEN_LOGOS } from './pulsechain.js';

/** Tokens shown on the Home tab live chart switcher */
export const CHART_TOKENS = [
  {
    symbol: 'VDO',
    address: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00',
    lcwCode: 'VDO',
    /**
     * Liquid VDO/WPLS pool that tracks GT simple token_price (~market).
     * Avoid 0x8ea17c… (VDO/DAI) — often ~10% mispriced vs other pools.
     */
    poolAddress: '0x2f2ac1c1d548c838a1ae54b848da9d20419a8246',
    logo: TOKEN_LOGOS.VDO,
  },
  {
    symbol: 'MAGIC',
    address: '0xd63b9d8d6e38cb7fbfdceede3ce92f97f5aea7ac',
    lcwCode: '__________MAGIC',
    poolAddress: '0xa16f023f4ecd1ac966058a369f5128f770664134',
    logo: TOKEN_LOGOS.MAGIC,
  },
  {
    symbol: 'POISON',
    address: '0xb8c8761fed2aad5c0a75561bc604531a42c452e6',
    lcwCode: '__POISON',
    poolAddress: '0xb717ae3e1120189270330b148fe8384d2c40c725',
    logo: TOKEN_LOGOS.POISON,
  },
];

export function getChartToken(symbol) {
  return CHART_TOKENS.find((t) => t.symbol === symbol) || CHART_TOKENS[0];
}