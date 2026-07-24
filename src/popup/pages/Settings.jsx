import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { WALLET_LOCALES } from '../../lib/i18n/locales.js';
import { FIAT_CURRENCIES } from '../../lib/fiat';
import { DEFAULT_THEME } from '../../lib/theme';
import { getAutoLockMs } from '../../lib/auto-lock';
import { currencyIconUrl, localeFlagUrl } from '../../lib/assets';
import { openPrivacyPolicy } from '../../lib/privacy';
import { openContributeGitHub, openFeedbackEmail } from '../../lib/feedback';
import { translateError } from '../../lib/i18n/translate-error.js';
import { sendRuntimeMessage } from '../../lib/runtime-message.js';
import { formatTokenPrice } from '../../lib/prices.js';
import {
  getRichlistHomeEnabled,
  setRichlistHomeEnabled,
  getTransfer2faEnabled,
  setTransfer2faEnabled,
} from '../../lib/storage.js';
// DEV_DEMO_BALANCE — remove with src/lib/dev-demo-balance.js
import { DEV_DEMO_USD } from '../../lib/dev-demo-balance.js';
import PopupSelect from '../../components/PopupSelect.jsx';
import SwapErrorModal from '../../components/SwapErrorModal.jsx';

const COLOUR_FIELDS = [
  { key: 'accent', labelKey: 'colour_accent' },
  { key: 'text', labelKey: 'colour_text' },
  { key: 'muted', labelKey: 'colour_muted' },
  { key: 'border', labelKey: 'colour_borders' },
];

function SettingsBack({ onBack }) {
  const { t } = useI18n();
  return (
    <div className="settings-subnav">
      <button type="button" className="settings-back-btn" onClick={onBack}>
        <span className="settings-back-icon" aria-hidden>‹</span>
        {t('nav_settings')}
      </button>
    </div>
  );
}

export default function Settings() {
  const { t, locale, setLocale } = useI18n();
  const {
    theme, setTheme, fiatCurrency, changeFiat, changePassword,
    unlocked,
    address,
    incomingNotifications,
    setIncomingNotificationsEnabled,
    priceAlertsEnabled,
    setPriceAlertsEnabled,
    priceAlerts,
    removePriceAlert,
    getTotpEnabled,
    beginTotpSetup,
    confirmTotpSetup,
    disableTotp,
    // DEV_DEMO_BALANCE
    devDemoBalance,
    setDevDemoBalance,
  } = useWallet();
  const [notifStatus, setNotifStatus] = useState('');
  const [priceAlertStatus, setPriceAlertStatus] = useState('');
  const [richlistHomeEnabled, setRichlistHomeEnabledState] = useState(true);
  // DEV_DEMO_BALANCE
  const [devDemoLocal, setDevDemoLocal] = useState(false);
  const [transfer2faEnabled, setTransfer2faEnabledState] = useState(false);
  const [view, setView] = useState('main');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [formAlert, setFormAlert] = useState(null);
  const [connectedSites, setConnectedSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  // 2FA / authenticator
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState('');
  const [totpSuccess, setTotpSuccess] = useState('');
  const [totpPassword, setTotpPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpSetup, setTotpSetup] = useState(null); // { secret, uri, qrDataUrl }
  const [totpRecoveryCodes, setTotpRecoveryCodes] = useState(null);

  const loadConnectedSites = useCallback(() => {
    setSitesLoading(true);
    sendRuntimeMessage({ type: 'DAPP_GET_CONNECTIONS' }, (res) => {
      setConnectedSites(res?.origins || []);
      setSitesLoading(false);
    });
  }, []);

  useEffect(() => {
    if (view === 'connected-sites') loadConnectedSites();
  }, [view, loadConnectedSites]);

  useEffect(() => {
    if (view !== 'security-2fa' && view !== 'main') return undefined;
    let cancelled = false;
    getTotpEnabled().then((on) => {
      if (!cancelled) setTotpEnabled(on);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [view, getTotpEnabled]);

  useEffect(() => {
    let cancelled = false;
    getRichlistHomeEnabled()
      .then((on) => { if (!cancelled) setRichlistHomeEnabledState(on); })
      .catch(() => {});
    getTransfer2faEnabled()
      .then((on) => { if (!cancelled) setTransfer2faEnabledState(on); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // DEV_DEMO_BALANCE — sync toggle from wallet context
  useEffect(() => {
    setDevDemoLocal(Boolean(devDemoBalance));
  }, [devDemoBalance]);

  const handleDevDemoToggle = async (enabled) => {
    setDevDemoLocal(enabled);
    try {
      await setDevDemoBalance(enabled);
    } catch {
      setDevDemoLocal(!enabled);
    }
  };

  const handleRichlistToggle = async (enabled) => {
    setRichlistHomeEnabledState(enabled);
    try {
      await setRichlistHomeEnabled(enabled);
    } catch {
      setRichlistHomeEnabledState(!enabled);
    }
  };

  const handleTransfer2faToggle = async (enabled) => {
    if (enabled && !totpEnabled) {
      setTotpError(t('settings_transfer_2fa_need_totp'));
      setView('security-2fa');
      return;
    }
    setTransfer2faEnabledState(enabled);
    try {
      await setTransfer2faEnabled(enabled);
    } catch {
      setTransfer2faEnabledState(!enabled);
    }
  };

  const resetTotpForm = () => {
    setTotpError('');
    setTotpSuccess('');
    setTotpPassword('');
    setTotpCode('');
    setTotpSetup(null);
    setTotpRecoveryCodes(null);
  };

  const startTotpSetup = async () => {
    setTotpError('');
    setTotpSuccess('');
    setTotpBusy(true);
    try {
      const label = address ? `Wallet ${address.slice(0, 6)}…${address.slice(-4)}` : 'Wallet';
      const setup = await beginTotpSetup(label);
      setTotpSetup(setup);
      setTotpCode('');
      setTotpPassword('');
    } catch (e) {
      setTotpError(translateError(t, e.message) || e.message);
    } finally {
      setTotpBusy(false);
    }
  };

  const finishTotpSetup = async () => {
    setTotpError('');
    setTotpSuccess('');
    if (!totpSetup?.secret) return;
    if (!totpPassword) {
      setTotpError(t('error_current_password_required'));
      return;
    }
    setTotpBusy(true);
    try {
      const { recoveryCodes } = await confirmTotpSetup(totpPassword, totpSetup.secret, totpCode);
      setTotpEnabled(true);
      setTotpSetup(null);
      setTotpPassword('');
      setTotpCode('');
      setTotpRecoveryCodes(recoveryCodes);
      setTotpSuccess(t('settings_2fa_enabled_success'));
    } catch (e) {
      setTotpError(translateError(t, e.message) || e.message);
    } finally {
      setTotpBusy(false);
    }
  };

  const finishTotpDisable = async () => {
    setTotpError('');
    setTotpSuccess('');
    if (!totpPassword) {
      setTotpError(t('error_current_password_required'));
      return;
    }
    setTotpBusy(true);
    try {
      await disableTotp(totpPassword, totpCode);
      setTotpEnabled(false);
      resetTotpForm();
      setTotpSuccess(t('settings_2fa_disabled_success'));
    } catch (e) {
      setTotpError(translateError(t, e.message) || e.message);
    } finally {
      setTotpBusy(false);
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setTotpError(t('error_copy_clipboard'));
    }
  };

  const handleIncomingNotificationsToggle = async (enabled) => {
    setNotifStatus('');
    try {
      await setIncomingNotificationsEnabled(enabled);
    } catch (e) {
      setNotifStatus(translateError(t, e.message) || t('settings_notifications_sync_failed'));
    }
  };

  const handlePriceAlertsToggle = async (enabled) => {
    setPriceAlertStatus('');
    try {
      await setPriceAlertsEnabled(enabled);
    } catch (e) {
      setPriceAlertStatus(translateError(t, e.message) || t('price_alert_save_failed'));
    }
  };

  const handleRemovePriceAlert = async (id) => {
    setPriceAlertStatus('');
    try {
      await removePriceAlert(id);
    } catch (e) {
      setPriceAlertStatus(translateError(t, e.message) || t('price_alert_save_failed'));
    }
  };

  const disconnectSite = (origin) => {
    sendRuntimeMessage({ type: 'DAPP_DISCONNECT', origin }, loadConnectedSites);
  };

  const update = (key, value) => {
    setTheme({ ...theme, [key]: value });
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    setFormAlert(null);

    if (!currentPassword) {
      setPasswordError(t('error_current_password_required'));
      return;
    }
    if (newPassword.length < 8) {
      setFormAlert({
        reason: 'form',
        title: t('error_password_min_title'),
        body: t('error_password_min_body'),
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormAlert({
        reason: 'form',
        title: t('error_password_mismatch_title'),
        body: t('error_password_mismatch_body'),
      });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError(t('error_new_password_same'));
      return;
    }

    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(t('password_updated'));
    } catch (e) {
      setPasswordError(e.message || t('error_change_password'));
    } finally {
      setPasswordBusy(false);
    }
  };

  const passwordMismatchModal = (
    <SwapErrorModal
      open={Boolean(formAlert)}
      blocker={formAlert}
      onClose={() => setFormAlert(null)}
      title={formAlert?.title}
      fullCover
    />
  );

  if (view === 'security-2fa') {
    return (
      <div className="settings-subpage">
        <SettingsBack onBack={() => { resetTotpForm(); setView('main'); }} />
        <div className="card totp-settings-card">
          <div className="label">{t('settings_2fa')}</div>
          <p className="muted" style={{ fontSize: 13 }}>{t('settings_2fa_intro')}</p>
          <p className={`totp-status${totpEnabled ? ' is-on' : ''}`}>
            {totpEnabled ? t('settings_2fa_status_on') : t('settings_2fa_status_off')}
          </p>

          {totpEnabled && !totpSetup && !totpRecoveryCodes && (
            <div className="settings-toggle-row" style={{ marginTop: 14, marginBottom: 8 }}>
              <div>
                <div className="label" style={{ margin: 0 }}>{t('settings_transfer_2fa')}</div>
                <p className="muted settings-toggle-hint">{t('settings_transfer_2fa_hint')}</p>
              </div>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={transfer2faEnabled}
                  onChange={(e) => handleTransfer2faToggle(e.target.checked)}
                />
                <span className="settings-switch-track" aria-hidden="true" />
              </label>
            </div>
          )}

          {totpRecoveryCodes && (
            <div className="totp-recovery-box">
              <div className="label">{t('settings_2fa_recovery_title')}</div>
              <p className="muted" style={{ fontSize: 12 }}>{t('settings_2fa_recovery_hint')}</p>
              <ul className="totp-recovery-list">
                {totpRecoveryCodes.map((c) => (
                  <li key={c}><code>{c}</code></li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => copyText(totpRecoveryCodes.join('\n'))}
              >
                {t('settings_2fa_copy_codes')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setTotpRecoveryCodes(null);
                  setTotpSuccess('');
                }}
              >
                {t('settings_2fa_recovery_done')}
              </button>
            </div>
          )}

          {!totpRecoveryCodes && !totpEnabled && !totpSetup && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={totpBusy || !unlocked}
              onClick={startTotpSetup}
            >
              {t('settings_2fa_enable')}
            </button>
          )}

          {!totpRecoveryCodes && totpSetup && (
            <div className="totp-setup">
              <div className="label">{t('settings_2fa_setup_title')}</div>
              <p className="muted" style={{ fontSize: 12 }}>{t('settings_2fa_scan_hint')}</p>
              {totpSetup.qrDataUrl && (
                <img
                  src={totpSetup.qrDataUrl}
                  alt=""
                  className="totp-qr"
                  width={180}
                  height={180}
                />
              )}
              <p className="muted" style={{ fontSize: 12 }}>{t('settings_2fa_manual_secret')}</p>
              <code className="totp-secret">{totpSetup.secret}</code>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => copyText(totpSetup.secret)}
              >
                {t('settings_2fa_copy_secret')}
              </button>
              <label className="label">{t('settings_2fa_password_confirm')}</label>
              <input
                type="password"
                value={totpPassword}
                onChange={(e) => setTotpPassword(e.target.value)}
                autoComplete="current-password"
              />
              <label className="label">{t('settings_2fa_confirm_code')}</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('totp_code_placeholder')}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={totpBusy}
                onClick={finishTotpSetup}
              >
                {t('settings_2fa_confirm_enable')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={totpBusy}
                onClick={() => { setTotpSetup(null); setTotpCode(''); setTotpPassword(''); }}
              >
                {t('cancel')}
              </button>
            </div>
          )}

          {!totpRecoveryCodes && totpEnabled && (
            <div className="totp-disable">
              <p className="muted" style={{ fontSize: 12 }}>{t('settings_2fa_disable_hint')}</p>
              <label className="label">{t('settings_2fa_password_confirm')}</label>
              <input
                type="password"
                value={totpPassword}
                onChange={(e) => setTotpPassword(e.target.value)}
                autoComplete="current-password"
              />
              <label className="label">{t('totp_code_label')}</label>
              <input
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.slice(0, 12))}
                placeholder={t('totp_code_placeholder')}
              />
              <button
                type="button"
                className="btn btn-danger"
                disabled={totpBusy}
                onClick={finishTotpDisable}
              >
                {t('settings_2fa_disable')}
              </button>
            </div>
          )}

          {totpError && <p className="error">{totpError}</p>}
          {totpSuccess && !totpRecoveryCodes && <p className="success">{totpSuccess}</p>}
        </div>
      </div>
    );
  }

  if (view === 'security-password') {
    return (
      <div className="settings-subpage">
        <SettingsBack onBack={() => setView('main')} />
        <div className="card">
          <div className="label">{t('settings_security_password')}</div>
          <p className="muted" style={{ fontSize: 13 }}>
            {t('security_auto_lock', { minutes: getAutoLockMs() / 60_000 })}
          </p>
          <div style={{ marginTop: 16 }}>
            <div className="label">{t('settings_change_password')}</div>
            <p className="muted" style={{ fontSize: 12 }}>
              {t('settings_change_password_hint')}
            </p>
            <label className="label">{t('current_password')}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <label className="label">{t('new_password')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <label className="label">{t('confirm_new_password')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={passwordBusy}
              onClick={handleChangePassword}
            >
              {passwordBusy ? t('updating') : t('update_password')}
            </button>
            {passwordError && <p className="error">{passwordError}</p>}
            {passwordSuccess && <p className="success">{passwordSuccess}</p>}
          </div>
        </div>
        {passwordMismatchModal}
      </div>
    );
  }

  if (view === 'connected-sites') {
    return (
      <div className="settings-subpage">
        <SettingsBack onBack={() => setView('main')} />
        <div className="card">
          <div className="label">{t('settings_connected_sites')}</div>
          <p className="muted" style={{ fontSize: 13 }}>
            {t('settings_connected_sites_hint')}
          </p>
          {sitesLoading && <p className="muted">{t('loading')}</p>}
          {!sitesLoading && connectedSites.length === 0 && (
            <p className="muted" style={{ marginTop: 8 }}>{t('no_connected_sites')}</p>
          )}
          {connectedSites.map((origin) => (
            <div key={origin} className="settings-site-row">
              <span className="settings-site-origin">{origin.replace(/^https?:\/\//, '')}</span>
              <button
                type="button"
                className="btn btn-secondary settings-site-disconnect"
                onClick={() => disconnectSite(origin)}
              >
                {t('disconnect')}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="label">{t('settings_language')}</div>
        <p className="muted">{t('settings_language_hint')}</p>
        <PopupSelect
          value={locale}
          onChange={setLocale}
          ariaLabel={t('settings_language')}
          options={WALLET_LOCALES.map((loc) => ({
            value: loc.code,
            icon: localeFlagUrl(loc.code),
            label: `${loc.nativeName} (${loc.name})`,
          }))}
        />
      </div>

      <div className="card">
        <div className="settings-toggle-row">
          <div>
            <div className="label" style={{ margin: 0 }}>{t('settings_notifications')}</div>
            <p className="muted settings-toggle-hint">{t('settings_notifications_hint')}</p>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={incomingNotifications}
              onChange={(e) => handleIncomingNotificationsToggle(e.target.checked)}
            />
            <span className="settings-switch-track" aria-hidden="true" />
          </label>
        </div>
        {notifStatus && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{notifStatus}</p>}
        {incomingNotifications && !unlocked && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t('settings_notifications_unlock_hint')}</p>
        )}
      </div>

      <div className="card">
        <div className="settings-toggle-row">
          <div>
            <div className="label" style={{ margin: 0 }}>{t('settings_richlist')}</div>
            <p className="muted settings-toggle-hint">{t('settings_richlist_hint')}</p>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={richlistHomeEnabled}
              onChange={(e) => handleRichlistToggle(e.target.checked)}
            />
            <span className="settings-switch-track" aria-hidden="true" />
          </label>
        </div>
      </div>

      {/* DEV_DEMO_BALANCE — remove this whole card + lib/dev-demo-balance.js later */}
      <div className="card">
        <div className="settings-toggle-row">
          <div>
            <div className="label" style={{ margin: 0 }}>{t('settings_dev_mode')}</div>
            <p className="muted settings-toggle-hint">
              {t('settings_dev_mode_hint', { amount: DEV_DEMO_USD })}
            </p>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={devDemoLocal}
              onChange={(e) => handleDevDemoToggle(e.target.checked)}
            />
            <span className="settings-switch-track" aria-hidden="true" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="settings-toggle-row">
          <div>
            <div className="label" style={{ margin: 0 }}>{t('settings_price_alerts')}</div>
            <p className="muted settings-toggle-hint">{t('settings_price_alerts_hint')}</p>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={priceAlertsEnabled}
              onChange={(e) => handlePriceAlertsToggle(e.target.checked)}
            />
            <span className="settings-switch-track" aria-hidden="true" />
          </label>
        </div>
        {priceAlertStatus && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{priceAlertStatus}</p>
        )}
        {priceAlertsEnabled && (
          <div className="price-alert-settings-list">
            <div className="label">{t('price_alert_active')}</div>
            {priceAlerts.length === 0 ? (
              <div className="price-alert-settings-copy">
                <p className="muted">{t('price_alert_none')}</p>
                <p className="muted">{t('price_alert_settings_hint')}</p>
              </div>
            ) : (
              <>
                {priceAlerts.map((alert) => (
                  <div key={alert.id} className="price-alert-settings-row">
                    <span>
                      {alert.symbol}
                      {' '}
                      {t(alert.direction === 'below'
                        ? 'price_alert_direction_below'
                        : 'price_alert_direction_above')}
                      {' '}
                      {formatTokenPrice(alert.target, alert.currency)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary price-alert-remove-btn"
                      onClick={() => handleRemovePriceAlert(alert.id)}
                    >
                      {t('price_alert_remove')}
                    </button>
                  </div>
                ))}
                <p className="muted price-alert-settings-foot">{t('price_alert_settings_hint')}</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="label">{t('settings_display_currency')}</div>
        <p className="muted">{t('settings_display_currency_hint')}</p>
        <PopupSelect
          value={fiatCurrency}
          onChange={changeFiat}
          ariaLabel={t('settings_display_currency')}
          className="settings-currency-select"
          options={FIAT_CURRENCIES.map((currency) => ({
            value: currency.code,
            icon: currencyIconUrl(currency.code),
            label: `${currency.label} (${currency.code.toUpperCase()})`,
          }))}
        />
      </div>

      <div className="card">
        <div className="label">{t('settings_colours')}</div>
        <p className="muted">{t('settings_colours_hint')}</p>
        {COLOUR_FIELDS.map(({ key, labelKey }) => (
          <div key={key} className="row" style={{ marginBottom: 8 }}>
            <span className="label" style={{ margin: 0 }}>{t(labelKey)}</span>
            <input
              type="color"
              value={theme[key] || DEFAULT_THEME[key]}
              onChange={(e) => update(key, e.target.value)}
              style={{ width: 48, height: 32, padding: 2, margin: 0 }}
            />
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => setTheme(DEFAULT_THEME)}>
          {t('reset_default')}
        </button>
      </div>

      <div className="card">
        <div className="label">{t('settings_security_password')}</div>
        <button
          type="button"
          className="settings-menu-item"
          onClick={() => setView('security-password')}
        >
          <span>{t('settings_menu_password')}</span>
          <span className="settings-menu-chevron" aria-hidden>›</span>
        </button>
        <button
          type="button"
          className="settings-menu-item"
          onClick={() => { resetTotpForm(); setView('security-2fa'); }}
        >
          <span>{t('settings_menu_2fa')}</span>
          <span className="settings-menu-chevron" aria-hidden>›</span>
        </button>
        <button
          type="button"
          className="settings-menu-item"
          onClick={() => setView('connected-sites')}
        >
          <span>{t('settings_connected_sites')}</span>
          <span className="settings-menu-chevron" aria-hidden>›</span>
        </button>
      </div>

      <div className="card">
        <div className="label">{t('settings_feedback')}</div>
        <p className="muted" style={{ fontSize: 13 }}>
          {t('settings_feedback_hint')}
        </p>
        <button
          type="button"
          className="settings-menu-item"
          onClick={openFeedbackEmail}
        >
          <span>{t('settings_feedback_action')}</span>
          <span className="settings-menu-chevron" aria-hidden>›</span>
        </button>
      </div>

      <div className="card">
        <div className="label">{t('settings_contribute')}</div>
        <p className="muted" style={{ fontSize: 13 }}>
          {t('settings_contribute_hint')}
        </p>
        <button
          type="button"
          className="settings-menu-item"
          onClick={openContributeGitHub}
        >
          <span>{t('settings_contribute_action')}</span>
          <span className="settings-menu-chevron" aria-hidden>›</span>
        </button>
      </div>

      <div className="card">
        <div className="label">{t('settings_privacy')}</div>
        <p className="muted" style={{ fontSize: 13 }}>
          {t('settings_privacy_hint')}
        </p>
        <button type="button" className="btn btn-secondary" onClick={openPrivacyPolicy}>
          {t('view_privacy_policy')}
        </button>
      </div>
      {passwordMismatchModal}
    </>
  );
}