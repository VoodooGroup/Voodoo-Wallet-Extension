import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  didCrossPriceTarget,
  normalizePriceAlert,
} from '../src/lib/price-alerts.js';

test('normalizePriceAlert accepts supported tokens', () => {
  const alert = normalizePriceAlert({
    symbol: 'vdo',
    target: 0.05,
    direction: 'above',
    currency: 'EUR',
  });
  assert.equal(alert.symbol, 'VDO');
  assert.equal(alert.target, 0.05);
  assert.equal(alert.currency, 'eur');
});

test('didCrossPriceTarget detects above and below crosses', () => {
  const above = { direction: 'above', target: 10 };
  assert.equal(didCrossPriceTarget(above, 9.5, 10.2), true);
  assert.equal(didCrossPriceTarget(above, 10.5, 10.2), false);

  const below = { direction: 'below', target: 10 };
  assert.equal(didCrossPriceTarget(below, 10.5, 9.8), true);
  assert.equal(didCrossPriceTarget(below, 9.5, 9.8), false);
});

test('price target notification copy is localized', () => {
  const nl = readFileSync('src/lib/i18n/messages/nl.js', 'utf8');
  const en = readFileSync('src/lib/i18n/messages/en.js', 'utf8');
  assert.match(nl, /notify_price_target_title: 'Tokenprijs bereikt een doel'/);
  assert.match(en, /notify_price_target_title/);
  assert.match(readFileSync('src/lib/price-alert-notifications.js', 'utf8'), /buildPriceTargetNotification/);
});

test('background polls price alerts on an alarm interval', () => {
  const source = readFileSync('src/background/price-alerts.js', 'utf8');
  const index = readFileSync('src/background/index.js', 'utf8');
  assert.match(source, /POLL_MINUTES = 5/);
  assert.match(source, /initPriceAlertMonitor/);
  assert.match(index, /PRICE_ALERT_SET_ENABLED/);
  assert.match(index, /initPriceAlertMonitor/);
});