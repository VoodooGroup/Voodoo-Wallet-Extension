import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useI18n } from '../context/I18nContext.jsx';
import { formatTokenPrice } from '../lib/prices.js';
import { translateError } from '../lib/i18n/translate-error.js';

export default function PriceAlertPanel({ symbol, livePrice = 0, fiatCurrency = 'usd', compact = false }) {
  const { t } = useI18n();
  const {
    priceAlertsEnabled,
    priceAlerts,
    addPriceAlert,
    removePriceAlert,
    defaultAlertDirection,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [direction, setDirection] = useState('above');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const existing = useMemo(
    () => priceAlerts.find((alert) => alert.symbol === symbol),
    [priceAlerts, symbol],
  );

  useEffect(() => {
    setOpen(false);
    setError('');
    setTarget('');
  }, [symbol]);

  const openForm = () => {
    setError('');
    setTarget('');
    setDirection(defaultAlertDirection(livePrice, Number(target) || livePrice * 1.1));
    setOpen(true);
  };

  const handleTargetChange = (value) => {
    setTarget(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      setDirection(defaultAlertDirection(livePrice, parsed));
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      await addPriceAlert({
        symbol,
        target: Number(target),
        direction,
        currency: fiatCurrency,
      });
      setOpen(false);
      setTarget('');
    } catch (e) {
      const key = e.message || '';
      setError(t(key) !== key ? t(key) : translateError(t, key) || t('price_alert_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id) => {
    setBusy(true);
    setError('');
    try {
      await removePriceAlert(id);
      setOpen(false);
    } catch (e) {
      setError(translateError(t, e.message) || t('price_alert_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  if (!priceAlertsEnabled) {
    return compact ? null : (
      <p className="muted price-alert-hint">{t('price_alert_enable_in_settings')}</p>
    );
  }

  return (
    <div className={`price-alert-panel${compact ? ' price-alert-panel-compact' : ''}`}>
      {!open && !existing && (
        <button type="button" className="btn btn-secondary price-alert-btn" onClick={openForm}>
          {t('price_alert_set')}
        </button>
      )}

      {!open && existing && (
        <div className="price-alert-active-row">
          <span className="muted">
            {t('price_alert_active_row', {
              symbol: existing.symbol,
              target: formatTokenPrice(existing.target, existing.currency),
              direction: t(existing.direction === 'below'
                ? 'price_alert_direction_below'
                : 'price_alert_direction_above'),
            })}
          </span>
          <button
            type="button"
            className="btn btn-secondary price-alert-remove-btn"
            disabled={busy}
            onClick={() => handleRemove(existing.id)}
          >
            {t('price_alert_remove')}
          </button>
        </div>
      )}

      {open && (
        <div className="price-alert-form">
          <label className="label">{t('price_alert_target')}</label>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={target}
            onChange={(e) => handleTargetChange(e.target.value)}
            placeholder={livePrice > 0 ? String(livePrice) : '0'}
          />
          <div className="price-alert-direction-row">
            <label className="price-alert-direction">
              <input
                type="radio"
                name={`price-alert-dir-${symbol}`}
                checked={direction === 'above'}
                onChange={() => setDirection('above')}
              />
              {t('price_alert_direction_above')}
            </label>
            <label className="price-alert-direction">
              <input
                type="radio"
                name={`price-alert-dir-${symbol}`}
                checked={direction === 'below'}
                onChange={() => setDirection('below')}
              />
              {t('price_alert_direction_below')}
            </label>
          </div>
          <div className="price-alert-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !target || Number(target) <= 0}
              onClick={handleSave}
            >
              {busy ? t('updating') : t('price_alert_save')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {error && <p className="error price-alert-error">{error}</p>}
    </div>
  );
}