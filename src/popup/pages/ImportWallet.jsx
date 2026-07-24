import { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { translateError } from '../../lib/i18n/translate-error.js';
import SwapErrorModal from '../../components/SwapErrorModal';

export default function ImportWallet({ onClose }) {
  const { t } = useI18n();
  const { importMnemonic, importPrivateKey } = useWallet();
  const [mode, setMode] = useState('import');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phrase, setPhrase] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formAlert, setFormAlert] = useState(null);

  const showFormAlert = (titleKey, bodyKey) => {
    setError('');
    setFormAlert({
      reason: 'form',
      title: t(titleKey),
      body: t(bodyKey),
    });
  };

  /** @returns {boolean} true if password fields are OK */
  const validatePassword = () => {
    if (password.length < 8) {
      showFormAlert('error_password_min_title', 'error_password_min_body');
      return false;
    }
    if (password !== confirm) {
      showFormAlert('error_password_mismatch_title', 'error_password_mismatch_body');
      return false;
    }
    return true;
  };

  const handleImportPhrase = async () => {
    setError('');
    setFormAlert(null);
    if (!validatePassword()) return;
    setBusy(true);
    try {
      await importMnemonic(phrase, password);
      onClose();
    } catch (e) {
      setError(translateError(t, e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleImportKey = async () => {
    setError('');
    setFormAlert(null);
    if (!validatePassword()) return;
    setBusy(true);
    try {
      await importPrivateKey(privateKey.trim(), password);
      onClose();
    } catch (e) {
      setError(translateError(t, e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-wallet-overlay" role="dialog" aria-modal="true" aria-labelledby="import-wallet-title">
      <div className="import-wallet-panel">
        <div className="import-wallet-top">
          <button type="button" className="import-wallet-back" onClick={onClose}>
            {t('cancel')}
          </button>
          <h2 id="import-wallet-title">{t('import_wallet')}</h2>
        </div>

        <p className="import-wallet-warning">{t('import_wallet_warning')}</p>

        <div className="tabs">
          {['import', 'privateKey'].map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'active' : ''}
              onClick={() => setMode(m)}
            >
              {m === 'import' ? t('tab_import_phrase') : t('tab_import_key')}
            </button>
          ))}
        </div>

        <label className="label">{t('password')}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <label className="label">{t('confirm_password')}</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />

        {mode === 'import' ? (
          <>
            <label className="label">{t('recovery_phrase')}</label>
            <textarea
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={t('placeholder_phrase')}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handleImportPhrase}
            >
              {busy ? t('loading') : t('import_wallet')}
            </button>
          </>
        ) : (
          <>
            <label className="label">{t('private_key')}</label>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder={t('placeholder_address')}
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handleImportKey}
            >
              {busy ? t('loading') : t('import_wallet')}
            </button>
          </>
        )}

        <div className="import-wallet-hardware">
          <div className="import-wallet-hardware-title">{t('hardware_wallet_title')}</div>
          <p className="muted">{t('hardware_wallet_unavailable')}</p>
        </div>

        {error && <p className="error">{error}</p>}
      </div>
      <SwapErrorModal
        open={Boolean(formAlert)}
        blocker={formAlert}
        onClose={() => setFormAlert(null)}
        title={formAlert?.title}
        fullCover
      />
    </div>
  );
}