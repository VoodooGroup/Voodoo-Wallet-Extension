import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDNodeWallet, Wallet, isHexString } from 'ethers';
import { getProvider } from './chain';
import { defaultAccounts } from './accounts';

export { defaultAccounts };

export function createMnemonic(wordCount = 12) {
  const strength = wordCount === 24 ? 256 : 128;
  return generateMnemonic(wordlist, strength);
}

export function normalizeMnemonic(phrase) {
  return phrase.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
}

export function validatePhrase(phrase) {
  return validateMnemonic(normalizeMnemonic(phrase), wordlist);
}

export async function deriveAccountFromMnemonic(mnemonic, accountIndex = 0) {
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  const path = `m/44'/60'/${accountIndex}'/0/0`;
  const hd = HDNodeWallet.fromSeed(seed);
  const child = hd.derivePath(path);
  return new Wallet(child.privateKey, getProvider());
}

export function walletFromPrivateKey(privateKey) {
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  if (!isHexString(key, 32)) throw new Error('error_invalid_private_key');
  return new Wallet(key, getProvider());
}

export function shortenAddress(addr, chars = 4) {
  if (!addr) return '';
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

