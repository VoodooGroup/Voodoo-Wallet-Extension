import test from 'node:test';
import assert from 'node:assert/strict';
import { Contract, JsonRpcProvider, parseUnits, formatUnits } from 'ethers';
import { WPLS_ADDRESS, SWAP_ROUTERS } from '../src/config/swap.js';
import { buildSwapPaths } from '../src/lib/swap-paths.js';

const PLS = { symbol: 'PLS', isNative: true };
const VDO = {
  symbol: 'VDO',
  address: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00',
};

test('WPLS address is valid and has contract code', async () => {
  const provider = new JsonRpcProvider('https://pulsechain.publicnode.com', 369, { staticNetwork: true });
  const code = await provider.getCode(WPLS_ADDRESS);
  assert.ok(code && code !== '0x', 'WPLS should be a deployed contract');
});

test('PulseX routers return on-chain quotes for PLS to VDO', async () => {
  const provider = new JsonRpcProvider('https://pulsechain.publicnode.com', 369, { staticNetwork: true });
  const routerAbi = ['function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)'];
  const amountIn = parseUnits('1000', 18);
  const paths = buildSwapPaths(PLS, VDO);

  let best = 0;
  for (const router of SWAP_ROUTERS) {
    const contract = new Contract(router.address, routerAbi, provider);
    for (const path of paths) {
      const amounts = await contract.getAmountsOut(amountIn, path);
      const out = Number(formatUnits(amounts[amounts.length - 1], 18));
      if (out > best) best = out;
    }
  }

  assert.ok(best > 20 && best < 30, `expected ~24 VDO for 1000 PLS, got ${best}`);
});