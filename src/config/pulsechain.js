export const PULSECHAIN = {
  id: 369,
  name: 'PulseChain',
  nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
  rpcUrl: 'https://pulsechain.publicnode.com',
  rpcUrls: [
    'https://pulsechain.publicnode.com',
    'https://rpc.pulsechain.com',
  ],
  explorer: 'https://otter.pulsechain.com',
  scanApi: 'https://api.scan.pulsechain.com/api',
};

export const TOKEN_LOGOS = {
  // Prefer sharp PNG (128px) over tiny webp — webp looked blurry in small dropdowns
  PLS: 'pulsechain-logo.png',
  VDO: 'voodoo-token.png',
  MAGIC: 'magic-token.png',
  POISON: 'poison-token.png',
  WPLS: 'pulsechain-logo.png',
};

export const DEFAULT_TOKENS = [
  {
    address: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00',
    symbol: 'VDO',
    name: 'Voodoo Token',
    decimals: 18,
    logo: TOKEN_LOGOS.VDO,
    coingeckoId: null,
  },
  {
    address: '0xb8c8761fed2aad5c0a75561bc604531a42c452e6',
    symbol: 'POISON',
    name: 'POISON',
    // On-chain ERC20 decimals are 9 (not 18) — wrong value breaks swap quotes & balances
    decimals: 9,
    logo: TOKEN_LOGOS.POISON,
    coingeckoId: null,
  },
  {
    address: '0xd63b9d8d6e38cb7fbfdceede3ce92f97f5aea7ac',
    symbol: 'MAGIC',
    name: 'MAGIC',
    decimals: 18,
    logo: TOKEN_LOGOS.MAGIC,
    coingeckoId: null,
  },
  {
    address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
    symbol: 'WPLS',
    name: 'Wrapped Pulse',
    decimals: 18,
    logo: TOKEN_LOGOS.WPLS,
    coingeckoId: null,
  },
];

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
];