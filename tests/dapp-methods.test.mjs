import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadOnlyRpcMethod,
  isUnsupportedChainSwitch,
  requestsAccountPermission,
  PULSECHAIN_CHAIN_ID_HEX,
} from '../src/lib/dapp-methods.js';

test('isReadOnlyRpcMethod identifies whitelisted methods', () => {
  assert.equal(isReadOnlyRpcMethod('eth_chainId'), true);
  assert.equal(isReadOnlyRpcMethod('eth_sendTransaction'), false);
  assert.equal(isReadOnlyRpcMethod('personal_sign'), false);
});

test('isUnsupportedChainSwitch only blocks non-PulseChain ids', () => {
  assert.equal(isUnsupportedChainSwitch('0x1'), true);
  assert.equal(isUnsupportedChainSwitch(PULSECHAIN_CHAIN_ID_HEX), false);
  assert.equal(isUnsupportedChainSwitch(undefined), false);
});

test('requestsAccountPermission detects account permission requests', () => {
  assert.equal(requestsAccountPermission('eth_requestAccounts', []), true);
  assert.equal(requestsAccountPermission('wallet_requestPermissions', [{ eth_accounts: {} }]), true);
  assert.equal(requestsAccountPermission('personal_sign', ['0x']), false);
});