import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSwapPaths, swapPathAddress } from '../src/lib/swap-paths.js';
import { WPLS_ADDRESS } from '../src/config/swap.js';

const VDO = { symbol: 'VDO', address: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00' };
const MAGIC = { symbol: 'MAGIC', address: '0xd63b9d8d6e38cb7fbfdceede3ce92f97f5aea7ac' };

test('swapPathAddress maps PLS to WPLS', () => {
  assert.equal(swapPathAddress({ symbol: 'PLS', isNative: true }), WPLS_ADDRESS);
  assert.equal(swapPathAddress(VDO), VDO.address);
});

test('buildSwapPaths includes direct and WPLS hop', () => {
  const paths = buildSwapPaths(VDO, MAGIC);
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[0], [VDO.address, MAGIC.address]);
  assert.deepEqual(paths[1], [VDO.address, WPLS_ADDRESS, MAGIC.address]);
});