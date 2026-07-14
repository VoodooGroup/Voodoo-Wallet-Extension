/** Official PulseChain ecosystem tokens — not shown by default; logo auto-applied on add. */
export const ECOSYSTEM_TOKENS = {
  '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d': {
    symbol: 'INC',
    logo: 'token-inc.webp',
  },
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': {
    symbol: 'HEX',
    logo: 'token-hex.webp',
  },
  '0xec4252e62c6de3d655ca9ce3afc12e553ebba274': {
    symbol: 'PUMP',
    logo: 'token-pump.webp',
  },
  '0xe33a5ae21f93acec5cfc0b7b0fdbb65a0f0be5cc': {
    symbol: 'MOST',
    logo: 'token-most.webp',
  },
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab': {
    symbol: 'PLSX',
    logo: 'token-plsx.webp',
  },
  '0xf6f8db0aba00007681f8faf16a0fda1c9b030b11': {
    symbol: 'PRVX',
    logo: 'token-prvx.webp',
  },
};

export function getEcosystemToken(address) {
  if (!address) return null;
  const key = address.trim().toLowerCase();
  return ECOSYSTEM_TOKENS[key] || null;
}

export function isOfficialEcosystemToken(address) {
  return !!getEcosystemToken(address);
}