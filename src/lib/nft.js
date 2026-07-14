import { Contract } from 'ethers';
import { getProvider } from './chain';
import { ERC721_ABI } from '../config/pulsechain';

export async function fetchNftsForContract(contractAddress, owner) {
  const contract = new Contract(contractAddress, ERC721_ABI, getProvider());
  let name = 'NFT';
  let symbol = 'NFT';
  try {
    [name, symbol] = await Promise.all([contract.name(), contract.symbol()]);
  } catch {
    /* optional metadata */
  }

  const balance = Number(await contract.balanceOf(owner));
  const items = [];
  for (let i = 0; i < Math.min(balance, 20); i += 1) {
    try {
      const tokenId = await contract.tokenOfOwnerByIndex(owner, i);
      let uri = '';
      try {
        uri = await contract.tokenURI(tokenId);
      } catch {
        uri = '';
      }
      items.push({ contractAddress, tokenId: tokenId.toString(), uri, name, symbol });
    } catch {
      break;
    }
  }
  return items;
}

export async function fetchAllNfts(owner, collections = []) {
  const results = await Promise.all(
    collections.map((c) => fetchNftsForContract(c.address, owner).catch(() => [])),
  );
  return results.flat();
}