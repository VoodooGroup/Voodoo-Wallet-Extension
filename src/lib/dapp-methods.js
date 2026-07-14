export const PULSECHAIN_CHAIN_ID = 369;
export const PULSECHAIN_CHAIN_ID_HEX = '0x171';

export const READONLY_RPC_METHODS = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
]);

export function isReadOnlyRpcMethod(method) {
  return typeof method === 'string' && method.startsWith('eth_') && READONLY_RPC_METHODS.has(method);
}

export function isUnsupportedChainSwitch(chainId, expectedHex = PULSECHAIN_CHAIN_ID_HEX) {
  return Boolean(chainId && chainId !== expectedHex);
}

export function requestsAccountPermission(method, params = []) {
  if (method === 'eth_requestAccounts') return true;
  if (method !== 'wallet_requestPermissions') return false;
  const entry = params[0];
  if (!entry || typeof entry !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(entry, 'eth_accounts');
}