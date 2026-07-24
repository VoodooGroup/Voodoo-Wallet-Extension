/** DEV_DEMO_BALANCE — delete with src/lib/dev-demo-balance.js */
import { applyDevDemoDisplay, DEV_DEMO_USD } from '../src/lib/dev-demo-balance.js';
import assert from 'node:assert/strict';

const base = {
  portfolioValue: 50,
  plsBalance: '10',
  tokens: [{ symbol: 'VDO', balance: '100' }, { symbol: 'PLSX', balance: '1' }],
  prices: { VDO: 0.01, PLS: 0.0001 },
};

const off = applyDevDemoDisplay({ enabled: false, ...base });
assert.equal(off.portfolioValue, 50);
assert.equal(off.tokens[0].balance, '100');

const on = applyDevDemoDisplay({ enabled: true, ...base });
assert.equal(on.portfolioValue, 50 + DEV_DEMO_USD);
assert.equal(Number(on.tokens[0].balance), 100 + DEV_DEMO_USD / 0.01);
assert.equal(on.tokens[1].balance, '1');

console.log('dev-demo-balance.test.mjs OK');
