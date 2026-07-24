import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext.jsx';
import { getPortfolioHistory } from '../lib/portfolio-history';
import { formatFiatAmount } from '../lib/fiat';

const WIDTH = 320;
const HEIGHT = 72;
const PAD = 6;

function linePath(values, width, height, pad) {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max * 0.01 || 1;

  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function PortfolioHistoryChart({ address, currentValue, fiatCurrency }) {
  const { t } = useI18n();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getPortfolioHistory(address);
      if (!cancelled) setHistory(rows);
    })();
    return () => { cancelled = true; };
  }, [address, currentValue]);

  const values = useMemo(() => history.map((h) => h.v), [history]);
  const path = linePath(values, WIDTH, HEIGHT, PAD);

  if (values.length < 2) {
    return null;
  }

  const first = values[0];
  const last = values[values.length - 1];
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = changePct >= 0;

  return (
    <div className="card portfolio-history-card">
    <div className="portfolio-history">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="label">{t('portfolio_trend')}</span>
        <span className={up ? 'price-up' : 'price-down'}>
          {up ? '+' : ''}
          {changePct.toFixed(2)}%
        </span>
      </div>
      <svg
        className="chart-canvas portfolio-chart-canvas"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('portfolio_chart_aria')}
      >
        <path
          d={path}
          fill="none"
          stroke={up ? '#059669' : '#d73847'}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {formatFiatAmount(first, fiatCurrency)}
        {' → '}
        {formatFiatAmount(last, fiatCurrency)}
        {' · '}
        {t('portfolio_local_history')}
      </div>
    </div>
    </div>
  );
}