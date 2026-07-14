import { isAddress, getAddress } from 'ethers';

export function normalizeAddress(input) {
  const trimmed = String(input || '').trim();
  if (!isAddress(trimmed)) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}

export function isValidAddress(input) {
  return normalizeAddress(input) !== null;
}