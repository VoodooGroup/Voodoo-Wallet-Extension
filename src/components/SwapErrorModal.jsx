import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../context/I18nContext.jsx';
import { formatSwapUiAmount } from '../lib/swap-tokens.js';

function CompactRow({ label, value, warn }) {
  return (
    <div className={`swap-error-row${warn ? ' is-warn' : ''}`}>
      <span className="swap-error-row-label">{label}</span>
      <span className="swap-error-row-value" title={value}>{value}</span>
    </div>
  );
}

function fmtAmt(value) {
  if (value == null || value === '') return '—';
  return formatSwapUiAmount(value, { maxFrac: 4, maxChars: 12 });
}

/**
 * Compact error popup — portaled to body.
 * Default: dims only the band between header and bottom nav.
 * fullCover: dims the entire popup (onboarding / no nav).
 */
export default function SwapErrorModal({
  open,
  blocker,
  onClose,
  title: titleProp,
  fullCover = false,
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !blocker || typeof document === 'undefined') return null;

  const isFunds = blocker.reason === 'insufficient_pls'
    || blocker.reason === 'insufficient_gas'
    || blocker.reason === 'insufficient_token';
  const isForm = blocker.reason === 'form';

  const symbol = blocker.tokenSymbol || 'PLS';
  const title = titleProp
    || (isFunds ? t('swap_blocked_title') : t('swap_failed_title'));

  let oneLiner = blocker.body || t('error_tx_failed_generic');
  if (blocker.reason === 'insufficient_token') {
    oneLiner = t('send_blocked_insufficient_token_body', { symbol });
  } else if (blocker.reason === 'insufficient_gas') {
    oneLiner = t('send_blocked_insufficient_gas_body');
  } else if (blocker.reason === 'insufficient_pls') {
    oneLiner = blocker.includesGas
      ? t('send_blocked_insufficient_pls_with_gas_body')
      : t('send_blocked_insufficient_pls_body');
  }

  const balance = blocker.reason === 'insufficient_token'
    ? blocker.tokenBalance
    : blocker.plsBalance;
  const needed = blocker.reason === 'insufficient_token'
    ? blocker.tokenRequired
    : blocker.plsRequired;
  const shortfall = blocker.shortfallPls;

  const modal = (
    <div
      className={`swap-error-overlay${fullCover ? ' is-full' : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="swap-error-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-error-title"
      >
        <div className="swap-error-top">
          <span
            className={`swap-error-dot${isFunds || isForm ? ' is-warn' : ' is-danger'}`}
            aria-hidden="true"
          >
            !
          </span>
          <h2 id="swap-error-title" className="swap-error-title">{title}</h2>
        </div>

        {isFunds ? (
          <>
            <p className="swap-error-oneliner">{oneLiner}</p>
            {(balance != null || needed != null) && (
              <div className="swap-error-stats">
                {balance != null && (
                  <CompactRow
                    label={t('send_blocked_your_balance', { symbol })}
                    value={`${fmtAmt(balance)} ${symbol}`}
                  />
                )}
                {blocker.sendAmount != null && blocker.reason !== 'insufficient_token' && (
                  <CompactRow
                    label={t('send_blocked_trying_to_send')}
                    value={`${fmtAmt(blocker.sendAmount)} PLS`}
                  />
                )}
                {blocker.gasEstimate != null && blocker.reason !== 'insufficient_token' && (
                  <CompactRow
                    label={t('send_blocked_gas_needed')}
                    value={`~${fmtAmt(blocker.gasEstimate)} PLS`}
                  />
                )}
                {needed != null && (
                  <CompactRow
                    label={t('send_blocked_total_needed')}
                    value={`${fmtAmt(needed)} ${symbol}`}
                    warn
                  />
                )}
                {shortfall != null && (
                  <CompactRow
                    label={t('send_blocked_shortfall')}
                    value={`${fmtAmt(shortfall)} ${symbol}`}
                    warn
                  />
                )}
              </div>
            )}
          </>
        ) : isForm ? (
          <p className="swap-error-oneliner">{oneLiner}</p>
        ) : (
          <p className="swap-error-generic-body">{oneLiner}</p>
        )}

        <button type="button" className="btn btn-danger swap-error-btn" onClick={onClose} autoFocus>
          {t('send_blocked_got_it')}
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
