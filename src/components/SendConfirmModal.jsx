import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../context/I18nContext.jsx';
import { formatPreviewPls } from '../lib/tx-preview.js';
import { shortenAddress } from '../lib/wallet.js';
import SendBlockerPanel from './SendBlockerPanel';
import TokenIcon from './TokenIcon';

function ConfirmRow({ label, children, mono }) {
  return (
    <div className="tx-confirm-row">
      <span className="tx-confirm-label">{label}</span>
      <span className={`tx-confirm-value${mono ? ' tx-confirm-mono' : ''}`}>{children}</span>
    </div>
  );
}

function PartyBlock({ label, name, address, icon }) {
  return (
    <div className="tx-confirm-party">
      <span className="tx-confirm-party-label">{label}</span>
      <div className="tx-confirm-party-body">
        {icon}
        <div className="tx-confirm-party-text">
          <div className="tx-confirm-party-name">{name}</div>
          <div className="tx-confirm-party-addr" title={address}>{shortenAddress(address, 6)}</div>
        </div>
      </div>
    </div>
  );
}

export default function SendConfirmModal({
  open,
  phase,
  preview,
  blocker,
  fromAccountName,
  to,
  amount,
  asset,
  selectedToken,
  busy,
  requireTotp = false,
  needTotpPassword = false,
  totpCode = '',
  totpPassword = '',
  totpError = '',
  onTotpCodeChange,
  onTotpPasswordChange,
  onCancel,
  onConfirm,
}) {
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!open) setShowDetails(false);
  }, [open]);

  if (!open || !phase) return null;

  const isBlocked = phase === 'blocked';
  const isReady = phase === 'ready' && preview;
  const totpReady = !requireTotp
    || (/^\d{6}$/.test(String(totpCode || '').trim())
      || String(totpCode || '').trim().length >= 8);
  const passwordReady = !requireTotp || !needTotpPassword || String(totpPassword || '').length > 0;
  const canConfirm = isReady && totpReady && passwordReady && !busy;

  const selfSend = preview
    && preview.fromAddress.toLowerCase() === preview.toAddress.toLowerCase();

  const toName = selfSend
    ? t('send_confirm_self_send')
    : shortenAddress(to, 8);

  const feePls = preview ? formatPreviewPls(preview.networkFeePls) : '—';
  const maxFeePls = preview ? formatPreviewPls(preview.maxFeePls) : '—';

  const modal = (
    <div className="modal-overlay tx-confirm-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal-card tx-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-confirm-title"
      >
        <div className="tx-confirm-header">
          <h2 id="tx-confirm-title" className="tx-confirm-title">
            {isBlocked ? t('send_blocked_title') : t('send_confirm_title')}
          </h2>
        </div>

        {isBlocked && (
          <SendBlockerPanel blocker={blocker} />
        )}

        {isReady && (
          <>
            <div className="tx-confirm-hero">
              <TokenIcon
                symbol={asset}
                logo={preview.tokenLogo || selectedToken?.logo}
                logoData={preview.tokenLogoData || selectedToken?.logoData}
              />
              <div>
                <div className="tx-confirm-hero-label">{t('send_confirm_sending')}</div>
                <div className="tx-confirm-hero-amount">
                  {amount}
                  {' '}
                  {asset}
                </div>
              </div>
            </div>

            <div className="tx-confirm-flow">
              <PartyBlock
                label={t('send_confirm_from')}
                name={fromAccountName || t('send_confirm_your_wallet')}
                address={preview.fromAddress}
                icon={(
                  <span className="tx-confirm-avatar" aria-hidden="true">
                    {(fromAccountName || 'A').slice(0, 1).toUpperCase()}
                  </span>
                )}
              />
              <span className="tx-confirm-arrow" aria-hidden="true">→</span>
              <PartyBlock
                label={t('send_confirm_to')}
                name={toName}
                address={preview.toAddress}
                icon={(
                  <span className="tx-confirm-avatar tx-confirm-avatar-to" aria-hidden="true">
                    {selfSend ? '↻' : '→'}
                  </span>
                )}
              />
            </div>

            <div className="tx-confirm-section">
              <ConfirmRow label={t('send_confirm_network')}>
                <span className="tx-confirm-inline">
                  <TokenIcon symbol="PLS" className="tx-confirm-network-icon" />
                  {preview.network}
                </span>
              </ConfirmRow>
              {!preview.isNative && (
                <ConfirmRow label={t('send_confirm_interacting')} mono>
                  {shortenAddress(preview.interactingWith, 6)}
                </ConfirmRow>
              )}
            </div>

            <div className="tx-confirm-section tx-confirm-fees">
              <ConfirmRow label={t('send_confirm_network_fee')}>
                {feePls}
                {' '}
                PLS
              </ConfirmRow>
              <ConfirmRow label={t('send_confirm_max_fee')}>
                {maxFeePls}
                {' '}
                PLS
              </ConfirmRow>
              <ConfirmRow label={t('send_confirm_speed')}>
                {t('send_confirm_speed_market')}
                {' · '}
                {t('send_confirm_est_time', { seconds: preview.estSeconds })}
              </ConfirmRow>
            </div>

            <button
              type="button"
              className="tx-confirm-details-toggle"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
            >
              {showDetails ? t('send_confirm_hide_details') : t('send_confirm_show_details')}
            </button>

            {showDetails && (
              <div className="tx-confirm-details">
                <ConfirmRow label={t('send_confirm_nonce')}>{preview.nonce}</ConfirmRow>
                {preview.isNative ? (
                  <ConfirmRow label={t('send_confirm_type')}>
                    {t('send_confirm_native_transfer')}
                  </ConfirmRow>
                ) : preview.callData && (
                  <>
                    <ConfirmRow label={t('send_confirm_function')} mono>
                      {preview.callData.function}
                    </ConfirmRow>
                    <ConfirmRow label={t('send_confirm_param_address')} mono>
                      {shortenAddress(preview.callData.params[0].value, 6)}
                    </ConfirmRow>
                    <ConfirmRow label={t('send_confirm_param_amount')} mono>
                      {preview.callData.params[1].value}
                    </ConfirmRow>
                  </>
                )}
              </div>
            )}

            <p className="tx-confirm-warning muted">{t('send_warning')}</p>

            {requireTotp && (
              <div className="tx-confirm-2fa">
                <div className="label">{t('send_2fa_label')}</div>
                <p className="muted tx-confirm-2fa-hint">{t('send_2fa_hint')}</p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t('totp_code_label')}
                  value={totpCode}
                  onChange={(e) => onTotpCodeChange?.(e.target.value.replace(/[^\dA-Za-z-]/g, '').slice(0, 16))}
                  className="tx-confirm-2fa-input"
                  disabled={busy}
                />
                {needTotpPassword && (
                  <>
                    <label className="label" style={{ marginTop: 10 }}>{t('password')}</label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={totpPassword}
                      onChange={(e) => onTotpPasswordChange?.(e.target.value)}
                      className="tx-confirm-2fa-input"
                      disabled={busy}
                      placeholder={t('password')}
                    />
                    <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {t('send_2fa_password_hint')}
                    </p>
                  </>
                )}
                {totpError ? <p className="error" style={{ marginTop: 8, fontSize: 12 }}>{totpError}</p> : null}
              </div>
            )}
          </>
        )}

        <div className="tx-confirm-actions">
          {isBlocked ? (
            <button type="button" className="btn btn-primary" onClick={onCancel}>
              {t('send_blocked_got_it')}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canConfirm}
                onClick={onConfirm}
              >
                {busy ? t('sending') : t('confirm_and_send')}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );

  return createPortal(modal, document.body);
}