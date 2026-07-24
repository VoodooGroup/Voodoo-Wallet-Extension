import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext.jsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Tooltip,
} from 'chart.js';
import { CHART_TOKENS } from '../config/chart-tokens.js';
import { CHART_RANGES, fetchTokenChart, getCachedTokenChart, prefetchTokenCharts } from '../lib/charts.js';
import { formatTokenPrice } from '../lib/prices.js';
import PriceAlertPanel from './PriceAlertPanel.jsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Tooltip,
);

/** Label for hover tooltip (LiveCoinWatch-style date/price). */
function formatChartTime(ms, rangeId) {
  if (!ms) return '';
  const d = new Date(ms);
  const longRange = rangeId === '30D' || rangeId === '90D' || rangeId === '12M';
  if (longRange) {
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(rangeId === '12M' ? { year: 'numeric' } : {}),
    });
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PriceChart({
  symbol, livePrice = 0, liveChange24h = 0, fiatCurrency = 'usd',
}) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [rangeId, setRangeId] = useState('24H');
  const [chart, setChart] = useState(() => getCachedTokenChart(symbol, '24H'));
  const [loading, setLoading] = useState(() => !getCachedTokenChart(symbol, '24H'));
  const [error, setError] = useState('');
  const [renderError, setRenderError] = useState('');

  useEffect(() => {
    // Prefetch other tokens after the active one has a head start.
    const others = CHART_TOKENS.map((tok) => tok.symbol).filter((s) => s !== symbol);
    const id = setTimeout(() => prefetchTokenCharts(others, rangeId), 600);
    return () => clearTimeout(id);
  }, [rangeId, symbol]);

  useEffect(() => {
    let cancelled = false;
    let safetyTimer;
    const cached = getCachedTokenChart(symbol, rangeId);

    if (cached) {
      setChart(cached);
      setLoading(false);
      setError('');
      setRenderError('');
    } else {
      setLoading(true);
      setError('');
      setRenderError('');
    }

    // Never leave "Loading chart…" forever if a network call hangs.
    safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setError((prev) => prev || t('chart_unavailable'));
      }
    }, 16_000);

    (async () => {
      try {
        const data = await fetchTokenChart(symbol, rangeId);
        if (!cancelled) {
          setChart(data);
          setError('');
          setRenderError('');
        }
      } catch (e) {
        if (!cancelled && !getCachedTokenChart(symbol, rangeId)) {
          setChart(null);
          setError(e.message || t('chart_unavailable'));
        }
      } finally {
        clearTimeout(safetyTimer);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [symbol, rangeId, t]);

  const hasChart = chart?.points?.length >= 2;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    chartRef.current?.destroy();
    chartRef.current = null;
    setRenderError('');

    if (!canvas || !hasChart) return undefined;

    try {
      const points = chart.points;
      const values = points.map((p) => p.price);
      const up = (chart.changePct ?? liveChange24h) >= 0;
      const stroke = up ? '#059669' : '#d73847';
      const fillTop = up ? 'rgba(5, 150, 105, 0.22)' : 'rgba(215, 56, 71, 0.22)';
      const fillBottom = up ? 'rgba(5, 150, 105, 0.02)' : 'rgba(215, 56, 71, 0.02)';

      const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, canvas.height || 120);
      gradient.addColorStop(0, fillTop);
      gradient.addColorStop(1, fillBottom);

      chartRef.current = new ChartJS(canvas, {
        type: 'line',
        data: {
          labels: points.map((p) => p.t),
          datasets: [{
            data: values,
            borderColor: stroke,
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            // Hidden by default; show a solid “bolletje” only while hovering
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 14,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: stroke,
            pointHoverBorderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: 'rgba(30, 36, 42, 0.94)',
              titleColor: 'rgba(255, 255, 255, 0.72)',
              bodyColor: '#fff',
              titleFont: { size: 11, weight: '500' },
              bodyFont: { size: 12, weight: '700' },
              padding: { top: 8, right: 10, bottom: 8, left: 10 },
              cornerRadius: 8,
              caretSize: 5,
              caretPadding: 6,
              callbacks: {
                title(items) {
                  const idx = items[0]?.dataIndex;
                  if (idx == null) return '';
                  return formatChartTime(points[idx]?.t, rangeId);
                },
                label(item) {
                  return formatTokenPrice(item.parsed.y, fiatCurrency);
                },
              },
            },
          },
          scales: {
            x: { display: false },
            y: { display: false },
          },
        },
      });
    } catch (e) {
      setRenderError(e.message || t('chart_unavailable'));
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chart, liveChange24h, hasChart, t, rangeId, fiatCurrency]);

  // Prefer live GT spot only — do NOT fall back to chart last candle.
  // Chart OHLCV can lag or use a mispriced pool and flash a wrong "live" price.
  const changePct = (liveChange24h != null && liveChange24h !== 0)
    ? liveChange24h
    : (chart?.changePct ?? 0);
  const displayPrice = Number(livePrice) > 0 ? Number(livePrice) : 0;
  const up = changePct >= 0;
  const showError = !loading && (error || renderError) && !hasChart;

  return (
    <div className="price-chart">
      <div className="row">
        <div>
          <div className="label">{t('symbol_live_price', { symbol })}</div>
          <div className="value chart-live-price">{formatTokenPrice(displayPrice, fiatCurrency)}</div>
        </div>
        <span className={up ? 'price-up' : 'price-down'}>
          {up ? '+' : ''}
          {changePct.toFixed(2)}%
          {' '}
          {rangeId}
        </span>
      </div>

      <PriceAlertPanel
        symbol={symbol}
        livePrice={displayPrice}
        fiatCurrency={fiatCurrency}
        compact
      />

      <div className="chart-range-row">
        {CHART_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`chart-range-btn${rangeId === r.id ? ' active' : ''}`}
            onClick={() => setRangeId(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="chart-canvas-wrap">
        {loading && (
          <div className="chart-loading-overlay muted" aria-live="polite">
            {t('chart_loading')}
          </div>
        )}
        {showError && <div className="chart-state muted">{error || renderError}</div>}
        <canvas
          ref={canvasRef}
          id="priceChart"
          className={`chart-canvas${loading && hasChart ? ' chart-canvas-loading' : ''}`}
          style={{ visibility: hasChart ? 'visible' : 'hidden' }}
          role="img"
          aria-label={`${symbol} price chart`}
        />
        {!hasChart && !loading && !showError && <div className="chart-state muted" aria-hidden="true" />}
      </div>
    </div>
  );
}