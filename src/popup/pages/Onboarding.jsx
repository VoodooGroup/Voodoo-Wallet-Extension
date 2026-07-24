import { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { translateError } from '../../lib/i18n/translate-error.js';
import { appBrandLogoUrl, warningIconUrl } from '../../lib/assets';
import WelcomeHeader from '../components/WelcomeHeader';
import CountrySelect from '../components/CountrySelect';
import SwapErrorModal from '../../components/SwapErrorModal';
import { getAppVersion } from '../../lib/version';

export default function Onboarding() {
  const { t, setLocale } = useI18n();
  const { generateWalletMnemonic, completeWalletCreation, importMnemonic, importPrivateKey } = useWallet();
  const [mode, setMode] = useState('create');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phrase, setPhrase] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [wordCount, setWordCount] = useState(12);
  const [generated, setGenerated] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formAlert, setFormAlert] = useState(null);
  const [copied, setCopied] = useState(false);
  const [createStep, setCreateStep] = useState('phrase');

  /** Nice mid-style popup instead of red inline text under the form */
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

  const handleCreate = async () => {
    setError('');
    setFormAlert(null);
    if (!validatePassword()) return;
    setBusy(true);
    try {
      const mnemonic = await generateWalletMnemonic(wordCount);
      setPendingPassword(password);
      setGenerated(mnemonic);
    } catch (e) {
      setError(translateError(t, e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleBackupConfirm = () => {
    setError('');
    setCreateStep('country');
  };

  const handleCountrySelect = async (locale) => {
    setBusy(true);
    setError('');
    try {
      await setLocale(locale);
      await completeWalletCreation(generated, pendingPassword);
      setPendingPassword('');
      setGenerated('');
      setCreateStep('phrase');
    } catch (e) {
      setError(translateError(t, e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleImportPhrase = async () => {
    setError('');
    setFormAlert(null);
    if (!validatePassword()) return;
    setBusy(true);
    try {
      await importMnemonic(phrase, password);
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
    } catch (e) {
      setError(translateError(t, e.message));
    } finally {
      setBusy(false);
    }
  };

  const copyRecoveryPhrase = async () => {
    try {
      await navigator.clipboard.writeText(generated);
      setError('');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('error_copy_clipboard'));
    }
  };

  if (generated) {
    const words = generated.split(' ');

    return (
      <div className="app app-wallpaper app-auth app-recovery">
        <div className="header header-centered recovery-header">
          <div className="recovery-logo-wrap">
            <img
              src={appBrandLogoUrl()}
              alt={t('app_name')}
              className="brand-logo"
              width={80}
              height={80}
            />
          </div>
          <h1>{createStep === 'country' ? t('select_country_title') : t('save_recovery_phrase')}</h1>
        </div>
        <div className="content auth-content recovery-content">
          {createStep === 'country' ? (
            <CountrySelect
              title={t('select_country_title')}
              busy={busy}
              onSelect={handleCountrySelect}
            />
          ) : (
            <>
              <p className="recovery-warning">
                <img
                  src={warningIconUrl()}
                  alt=""
                  className="recovery-warning-icon"
                  width={22}
                  height={22}
                  draggable={false}
                />
                <span>{t('save_recovery_hint')}</span>
              </p>
              <div className="recovery-sheet">
                <div className={`recovery-phrase-grid ${words.length > 12 ? 'is-24' : 'is-12'}`}>
                  {words.map((word, index) => (
                    <div key={word + index} className="recovery-word">
                      <span className="recovery-word-index">{index + 1}.</span>
                      <span className="recovery-word-text">{word}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="recovery-copy-btn" onClick={copyRecoveryPhrase}>
                  {copied ? t('copied') : t('copy_recovery_phrase')}
                </button>
              </div>
              <button
                type="button"
                className="btn btn-primary recovery-continue-btn"
                disabled={busy}
                onClick={handleBackupConfirm}
              >
                {t('written_it_down')}
              </button>
            </>
          )}
          {error && <p className="error recovery-error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app app-wallpaper app-auth">
      <WelcomeHeader title={t('welcome')} tagline={t('welcome_tagline')} />
      <div className="content auth-content">
        <div className="tabs">
          {['create', 'import', 'privateKey'].map((m) => (
            <button key={m} type="button" className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'create' ? t('tab_create') : m === 'import' ? t('tab_import_phrase') : t('tab_import_key')}
            </button>
          ))}
        </div>

        <label className="label">{t('password')}</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <label className="label">{t('confirm_password')}</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />

        {mode === 'create' && (
          <>
            <label className="label">{t('recovery_phrase_length')}</label>
            <select value={wordCount} onChange={(e) => setWordCount(Number(e.target.value))}>
              <option value={12}>{t('words_12')}</option>
              <option value={24}>{t('words_24')}</option>
            </select>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleCreate}>
              {t('generate_wallet')}
            </button>
            <p className="app-version">{t('version', { version: getAppVersion() })}</p>
          </>
        )}

        {mode === 'import' && (
          <>
            <label className="label">{t('recovery_phrase')}</label>
            <textarea value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={t('placeholder_phrase')} />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleImportPhrase}>
              {t('import_wallet')}
            </button>
            <p className="app-version">{t('version', { version: getAppVersion() })}</p>
          </>
        )}

        {mode === 'privateKey' && (
          <>
            <label className="label">{t('private_key')}</label>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder={t('placeholder_address')}
              autoComplete="off"
            />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleImportKey}>
              {t('import_wallet')}
            </button>
            <p className="app-version">{t('version', { version: getAppVersion() })}</p>
          </>
        )}

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