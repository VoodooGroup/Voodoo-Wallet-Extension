import { Contract } from 'ethers';
import { getProvider } from './chain';
import { ERC721_ABI, PULSECHAIN } from '../config/pulsechain';

/** ERC-721 + optional metadata / enumerable / ownership */
const ERC721_FULL_ABI = [
  ...ERC721_ABI,
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

/** ERC-1155 multi-token (NFTs + semi-fungible) */
const ERC1155_ABI = [
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function uri(uint256 id) view returns (string)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
];

const IFACE_ERC721 = '0x80ac58cd';
const IFACE_ERC721_ENUM = '0x780e9d63';
const IFACE_ERC1155 = '0xd9b67a26';

const SCAN_API = PULSECHAIN.scanApi;
const SCAN_TIMEOUT_MS = 15_000;
const MAX_NFTS_PER_CONTRACT = 40;
const MAX_DISCOVERED = 80;
const MAX_SCAN_OFFSET = 200;

async function optionalMeta(contract) {
  let name = 'NFT';
  let symbol = 'NFT';
  try {
    const [n, s] = await Promise.all([contract.name(), contract.symbol()]);
    if (n) name = n;
    if (s) symbol = s;
  } catch { /* optional */ }
  return { name, symbol };
}

/**
 * True if eth_call hit a real contract function that reverted (vs missing selector).
 * Used so we don't treat plain ERC-20 as ERC-721 (both have balanceOf).
 */
function looksLikeFunctionExists(err) {
  if (!err) return false;
  if (err.data && err.data !== '0x' && err.data !== '0x0') return true;
  const reason = String(err.reason || err.shortMessage || err.message || '').toLowerCase();
  // Common reverts when ownerOf/tokenURI exists but token id is invalid
  if (
    reason.includes('nonexistent')
    || reason.includes('non-existent')
    || reason.includes('invalid token')
    || reason.includes('owner query for nonexistent')
    || reason.includes('erc721')
    || reason.includes('token does not exist')
  ) {
    return true;
  }
  // ethers CALL_EXCEPTION with empty data often = missing function on many nodes
  if (err.code === 'CALL_EXCEPTION' && (!err.data || err.data === '0x')) {
    return false;
  }
  if (err.code === 'BAD_DATA') return false;
  return false;
}

/**
 * Detect NFT standard for a *collection* contract (ERC-721 or ERC-1155).
 * Regular wallets hold ERC-20 + NFTs; this is never about the wallet address itself.
 */
export async function detectNftStandard(contractAddress) {
  const provider = getProvider();
  const probe = new Contract(contractAddress, [
    'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  ], provider);

  try {
    if (await probe.supportsInterface(IFACE_ERC1155)) return 'erc1155';
  } catch { /* not 165 / no 1155 */ }
  try {
    if (await probe.supportsInterface(IFACE_ERC721)) return 'erc721';
  } catch { /* */ }

  // Fallback without ERC-165: use ownerOf (ERC-721 only) — NOT balanceOf
  // (ERC-20 also has balanceOf and would false-positive as NFT).
  try {
    const c721 = new Contract(contractAddress, ERC721_FULL_ABI, provider);
    try {
      await c721.ownerOf(0n);
      return 'erc721';
    } catch (err) {
      if (looksLikeFunctionExists(err)) return 'erc721';
    }
  } catch { /* */ }

  try {
    const c1155 = new Contract(contractAddress, ERC1155_ABI, provider);
    // balanceOf(account, id) is 2-arg — ERC-20 only has 1-arg balanceOf
    await c1155.balanceOf('0x0000000000000000000000000000000000000001', 0n);
    return 'erc1155';
  } catch (err) {
    if (looksLikeFunctionExists(err)) return 'erc1155';
  }

  return null;
}

export async function assertNftContract(contractAddress, owner) {
  const standard = await detectNftStandard(contractAddress);
  if (!standard) throw new Error('error_not_nft_contract');

  if (standard === 'erc721') {
    const contract = new Contract(contractAddress, ERC721_FULL_ABI, getProvider());
    try {
      await contract.balanceOf(owner);
    } catch {
      throw new Error('error_not_nft_contract');
    }
  } else if (standard === 'erc1155') {
    const contract = new Contract(contractAddress, ERC1155_ABI, getProvider());
    try {
      // Prove 2-arg balanceOf works for this owner (any id is fine)
      await contract.balanceOf(owner, 0n);
    } catch (err) {
      // Revert on id 0 is still OK if the function exists
      if (!looksLikeFunctionExists(err)) {
        throw new Error('error_not_nft_contract');
      }
    }
  }
  return standard;
}

/** @deprecated use assertNftContract — kept for compatibility */
export async function assertErc721Contract(contractAddress, owner) {
  const standard = await assertNftContract(contractAddress, owner);
  if (standard !== 'erc721' && standard !== 'erc1155') {
    throw new Error('error_not_erc721_contract');
  }
  return standard;
}

function parseScanRows(json) {
  if (String(json?.status) === '1' && Array.isArray(json.result)) return json.result;
  const msg = String(json?.message || '').toLowerCase();
  if (
    msg.includes('no transaction')
    || msg.includes('no record')
    || msg.includes('no token transfer')
    || msg.includes('no nft')
  ) {
    return [];
  }
  if (json?.status === '0' && Array.isArray(json.result)) return json.result;
  if (json?.status === '0' && (json?.result === '' || json?.result == null)) return [];
  if (json?.status === '0' && typeof json?.result === 'string' && !json.result.startsWith('0x')) {
    return [];
  }
  return [];
}

async function fetchScanNftTransfers(owner, { contractAddress, action = 'tokennfttx' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      module: 'account',
      action,
      address: owner,
      page: '1',
      offset: String(MAX_SCAN_OFFSET),
      sort: 'desc',
    });
    if (contractAddress) {
      params.set('contractaddress', contractAddress);
    }
    const res = await fetch(`${SCAN_API}?${params}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return parseScanRows(json);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Build currently held token IDs from transfer history (scan). */
function ownedIdsFromTransferRows(rows, owner) {
  const wallet = owner.toLowerCase();
  const bal = new Map();
  // Process oldest first so net balance ends correct
  const ordered = [...rows].sort((a, b) => Number(a.timeStamp || 0) - Number(b.timeStamp || 0));
  for (const tx of ordered) {
    const id = String(tx.tokenID ?? tx.tokenId ?? '');
    if (!id) continue;
    const from = (tx.from || '').toLowerCase();
    const to = (tx.to || '').toLowerCase();
    let value = 1n;
    try {
      value = BigInt(tx.tokenValue || tx.value || '1');
      if (value <= 0n) value = 1n;
    } catch {
      value = 1n;
    }
    let cur = bal.get(id) || 0n;
    if (to === wallet) cur += value;
    if (from === wallet) cur -= value;
    bal.set(id, cur);
  }
  return [...bal.entries()]
    .filter(([, v]) => v > 0n)
    .map(([id, value]) => ({ tokenId: id, balance: value.toString() }));
}

async function fetchEnumerable721(contractAddress, owner, meta) {
  const contract = new Contract(contractAddress, ERC721_FULL_ABI, getProvider());
  const balance = Number(await contract.balanceOf(owner));
  const items = [];
  for (let i = 0; i < Math.min(balance, MAX_NFTS_PER_CONTRACT); i += 1) {
    try {
      const tokenId = await contract.tokenOfOwnerByIndex(owner, i);
      let uri = '';
      try {
        uri = await contract.tokenURI(tokenId);
      } catch {
        uri = '';
      }
      items.push({
        contractAddress,
        tokenId: tokenId.toString(),
        uri,
        name: meta.name,
        symbol: meta.symbol,
        standard: 'erc721',
        balance: '1',
      });
    } catch {
      break;
    }
  }
  return items;
}

async function fetch721ByScan(contractAddress, owner, meta) {
  const rows = await fetchScanNftTransfers(owner, {
    contractAddress,
    action: 'tokennfttx',
  });
  const owned = ownedIdsFromTransferRows(rows, owner);
  const contract = new Contract(contractAddress, ERC721_FULL_ABI, getProvider());
  const items = [];

  let ownerBalance = null;
  try {
    ownerBalance = Number(await contract.balanceOf(owner));
  } catch {
    ownerBalance = null;
  }
  if (ownerBalance === 0) return [];

  for (const { tokenId } of owned.slice(0, MAX_NFTS_PER_CONTRACT)) {
    try {
      try {
        const own = await contract.ownerOf(tokenId);
        if (own.toLowerCase() !== owner.toLowerCase()) continue;
      } catch {
        continue;
      }
      let uri = '';
      try {
        uri = await contract.tokenURI(tokenId);
      } catch {
        uri = '';
      }
      items.push({
        contractAddress,
        tokenId: String(tokenId),
        uri,
        name: meta.name,
        symbol: meta.symbol,
        standard: 'erc721',
        balance: '1',
      });
    } catch {
      /* skip id */
    }
  }
  return items;
}

async function fetch1155ByScan(contractAddress, owner, meta) {
  let rows = await fetchScanNftTransfers(owner, {
    contractAddress,
    action: 'token1155tx',
  });
  if (!rows.length) {
    // Some scanners put 1155 under tokennfttx
    rows = await fetchScanNftTransfers(owner, {
      contractAddress,
      action: 'tokennfttx',
    });
  }
  const owned = ownedIdsFromTransferRows(rows, owner);
  const contract = new Contract(contractAddress, ERC1155_ABI, getProvider());
  const items = [];
  for (const { tokenId } of owned.slice(0, MAX_NFTS_PER_CONTRACT)) {
    try {
      const bal = await contract.balanceOf(owner, tokenId);
      if (bal <= 0n) continue;
      let uri = '';
      try {
        uri = await contract.uri(tokenId);
      } catch {
        uri = '';
      }
      items.push({
        contractAddress,
        tokenId: String(tokenId),
        uri,
        name: meta.name,
        symbol: meta.symbol,
        standard: 'erc1155',
        balance: bal.toString(),
      });
    } catch {
      /* skip */
    }
  }
  return items;
}

export async function fetchNftsForContract(contractAddress, owner) {
  const standard = await detectNftStandard(contractAddress);
  if (!standard) return [];

  if (standard === 'erc721') {
    const contract = new Contract(contractAddress, ERC721_FULL_ABI, getProvider());
    const meta = await optionalMeta(contract);
    try {
      const supportsEnum = await contract.supportsInterface(IFACE_ERC721_ENUM).catch(() => false);
      if (supportsEnum) {
        const items = await fetchEnumerable721(contractAddress, owner, meta);
        if (items.length) return items;
      }
    } catch { /* fall through */ }
    try {
      const items = await fetchEnumerable721(contractAddress, owner, meta);
      if (items.length) return items;
    } catch { /* non-enumerable */ }
    return fetch721ByScan(contractAddress, owner, meta);
  }

  // ERC-1155
  const contract = new Contract(contractAddress, ERC1155_ABI, getProvider());
  const meta = await optionalMeta(contract);
  return fetch1155ByScan(contractAddress, owner, meta);
}

/**
 * Discover NFTs held by any wallet (normal EOA / “ERC-20 wallet”) via PulseScan.
 * Uses tokennfttx (ERC-721) + token1155tx (ERC-1155) — no need to manually add
 * only ERC-721 collections. Trusts scan action type to avoid slow per-contract
 * ERC-165 probes that timed out and left the NFT list empty.
 */
export async function discoverWalletNfts(owner) {
  if (!owner) return [];

  const [nft721, nft1155] = await Promise.all([
    fetchScanNftTransfers(owner, { action: 'tokennfttx' }),
    fetchScanNftTransfers(owner, { action: 'token1155tx' }),
  ]);

  const byContract = new Map();

  const ingest = (rows, defaultStandard) => {
    for (const tx of rows) {
      const contractAddress = (tx.contractAddress || tx.tokenAddress || '').toLowerCase();
      const tokenId = String(tx.tokenID ?? tx.tokenId ?? '');
      if (!contractAddress || !tokenId || !contractAddress.startsWith('0x')) continue;
      if (!byContract.has(contractAddress)) {
        byContract.set(contractAddress, {
          address: contractAddress,
          name: tx.tokenName || 'NFT',
          symbol: tx.tokenSymbol || 'NFT',
          standard: defaultStandard,
          rows: [],
        });
      }
      const entry = byContract.get(contractAddress);
      entry.rows.push(tx);
      // Prefer 1155 if we also saw this contract on token1155tx
      if (defaultStandard === 'erc1155') entry.standard = 'erc1155';
      if (tx.tokenName) entry.name = tx.tokenName;
      if (tx.tokenSymbol) entry.symbol = tx.tokenSymbol;
    }
  };

  ingest(nft721, 'erc721');
  ingest(nft1155, 'erc1155');

  const all = [];
  const provider = getProvider();

  for (const entry of byContract.values()) {
    if (all.length >= MAX_DISCOVERED) break;
    const owned = ownedIdsFromTransferRows(entry.rows, owner);
    if (!owned.length) continue;

    // Prefer scan-reported standard — skip heavy detectNftStandard on every contract
    const standard = entry.standard === 'erc1155' ? 'erc1155' : 'erc721';

    if (standard === 'erc1155') {
      const contract = new Contract(entry.address, ERC1155_ABI, provider);
      for (const { tokenId, balance: scanBal } of owned) {
        if (all.length >= MAX_DISCOVERED) break;
        let balance = scanBal;
        let uri = '';
        try {
          const bal = await contract.balanceOf(owner, tokenId);
          if (bal <= 0n) continue;
          balance = bal.toString();
        } catch {
          // RPC failed — still show scan-derived ownership
          if (!balance || balance === '0') continue;
        }
        try {
          uri = await contract.uri(tokenId);
        } catch { /* */ }
        all.push({
          contractAddress: entry.address,
          tokenId: String(tokenId),
          uri,
          name: entry.name || 'NFT',
          symbol: entry.symbol || 'NFT',
          standard: 'erc1155',
          balance: String(balance),
        });
      }
    } else {
      const contract = new Contract(entry.address, ERC721_FULL_ABI, provider);
      for (const { tokenId } of owned) {
        if (all.length >= MAX_DISCOVERED) break;
        let stillOwned = true;
        try {
          const own = await contract.ownerOf(tokenId);
          stillOwned = own.toLowerCase() === owner.toLowerCase();
        } catch {
          // If ownerOf fails, keep scan-derived hold (history net > 0)
          stillOwned = true;
        }
        if (!stillOwned) continue;
        let uri = '';
        try {
          uri = await contract.tokenURI(tokenId);
        } catch { /* */ }
        all.push({
          contractAddress: entry.address,
          tokenId: String(tokenId),
          uri,
          name: entry.name || 'NFT',
          symbol: entry.symbol || 'NFT',
          standard: 'erc721',
          balance: '1',
        });
      }
    }
  }

  return all;
}

function nftKey(n) {
  return `${(n.contractAddress || '').toLowerCase()}:${n.tokenId}`;
}

/**
 * All NFTs for a wallet: auto-discovered (any EOA) + manually tracked collections.
 * Works for normal wallets that also hold ERC-20s — not limited to ERC-721-only.
 */
export async function fetchAllNfts(owner, collections = []) {
  if (!owner) return [];

  const [fromCollections, discovered] = await Promise.all([
    Promise.all(
      (collections || []).map((c) => fetchNftsForContract(c.address, owner).catch(() => [])),
    ).then((lists) => lists.flat()),
    discoverWalletNfts(owner).catch((err) => {
      console.warn('NFT discovery failed:', err?.message || err);
      return [];
    }),
  ]);

  // Collections override discovery for same key (richer on-chain data)
  const map = new Map();
  for (const n of discovered) {
    map.set(nftKey(n), n);
  }
  for (const n of fromCollections) {
    map.set(nftKey(n), n);
  }
  return [...map.values()];
}
