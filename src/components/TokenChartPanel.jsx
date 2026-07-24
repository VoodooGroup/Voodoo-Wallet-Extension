import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext.jsx';
import { CHART_TOKENS } from '../config/chart-tokens';
import { prefetchTokenCharts } from '../lib/charts.js';
import { formatFiatAmount } from '../lib/fiat';
import TokenIcon from './TokenIcon';
import PriceChart from './PriceChart';

export default function TokenChartPanel({ prices, fiatCurrency, vdoBalance = 0 }) {
  const { t } = useI18n();
  const [symbol, setSymbol] = useState('VDO');

  const price = prices[symbol] || 0;
  const changeKey = `${symbol}_CHANGE_24H`;
  const change24h = prices[changeKey] ?? 0;

  useEffect(() => {
    // Warm cache lightly; PriceChart loads the active symbol first.
    const id = setTimeout(() => {
      prefetchTokenCharts(CHART_TOKENS.map((t) => t.symbol), '24H');
    }, 800);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="card chart-panel">
      <PriceChart
        symbol={symbol}
        livePrice={price}
        liveChange24h={change24h}
        fiatCurrency={fiatCurrency}
      />

      <div className="chart-token-switch">
        {CHART_TOKENS.map((token) => (
          <button
            key={token.symbol}
            type="button"
            className={`chart-token-btn${symbol === token.symbol ? ' active' : ''}`}
            onClick={() => setSymbol(token.symbol)}
            title={`${token.symbol} chart`}
            aria-label={`Show ${token.symbol} chart`}
          >
            <TokenIcon symbol={token.symbol} logo={token.logo} />
          </button>
        ))}
      </div>

      <div className="chart-holdings-slot">
        {vdoBalance > 0 ? (
          <div className="vdo-holdings">
            {t('holdings_vdo', { balance: vdoBalance.toFixed(4) })}
            {(prices.VDO || 0) > 0 && (
              <>
                {' · '}
                {formatFiatAmount(vdoBalance * (prices.VDO || 0), fiatCurrency)}
              </>
            )}
          </div>
        ) : (
          <span className="chart-holdings-placeholder" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}