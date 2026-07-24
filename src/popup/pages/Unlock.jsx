import { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import WelcomeHeader from '../components/WelcomeHeader';
import { getAppVersion } from '../../lib/version';

export default function Unlock({ onUnlocked }) {
  const { t } = useI18n();
  const { unlock } = useWallet();
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [step, setStep] = useState('password'); // password | totp
  const [busy, setBusy] = useState(false);
  const [shakeField, setShakeField] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  /** Playful feedback instead of a red error banner */
  const bumpShake = () => {
    setShakeField(false);
    // Force reflow so animation restarts on rapid wrong tries
    requestAnimationFrame(() => {
      setShakeKey((k) => k + 1);
      setShakeField(true);
    });
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setShakeField(false);
    try {
      await unlock(password);
      onUnlocked?.();
    } catch (err) {
      if (err?.code === 'TOTP_REQUIRED' || err?.message === 'error_totp_required') {
        setStep('totp');
      } else {
        // Wrong password (or similar) — shake the field, no red message
        bumpShake();
        setPassword('');
      }
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (e) => {
    e.preventDefault();
    setBusy(true);
    setShakeField(false);
    try {
      await unlock(password, totpCode);
      onUnlocked?.();
    } catch (err) {
      if (err?.message === 'error_wrong_password') {
        setStep('password');
        setTotpCode('');
        setPassword('');
        bumpShake();
      } else {
        // Invalid 2FA code — shake the code field
        bumpShake();
        setTotpCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  if (step === 'totp') {
    return (
      <div className="app app-wallpaper app-auth">
        <WelcomeHeader
          title={t('totp_unlock_title')}
          tagline={t('totp_unlock_tagline')}
        />
        <form className="content auth-content" onSubmit={submitTotp}>
          <label className="label" htmlFor="unlock-totp">{t('totp_code_label')}</label>
          <input
            id="unlock-totp"
            key={`totp-${shakeKey}`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(e) => {
              setTotpCode(e.target.value.replace(/[^\dA-Za-z-]/g, '').slice(0, 12));
              if (shakeField) setShakeField(false);
            }}
            placeholder={t('totp_code_placeholder')}
            className={shakeField ? 'auth-input-shake' : undefined}
            autoFocus
            aria-invalid={shakeField}
          />
          <p className="muted" style={{ fontSize: 12 }}>
            {t('totp_unlock_hint')}
          </p>
          <button type="submit" className="btn btn-primary" disabled={busy || !totpCode.trim()}>
            {busy ? t('unlocking') : t('unlock')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              setStep('password');
              setTotpCode('');
              setShakeField(false);
            }}
          >
            {t('back')}
          </button>
          <p className="app-version">{t('version', { version: getAppVersion() })}</p>
        </form>
      </div>
    );
  }

  return (
    <div className="app app-wallpaper app-auth">
      <WelcomeHeader
        title={t('unlock_wallet')}
        tagline={t('unlock_tagline')}
      />
      <form className="content auth-content" onSubmit={submitPassword}>
        <label className="label" htmlFor="unlock-password">{t('password')}</label>
        <input
          id="unlock-password"
          key={`pw-${shakeKey}`}
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (shakeField) setShakeField(false);
          }}
          autoComplete="current-password"
          className={shakeField ? 'auth-input-shake' : undefined}
          autoFocus
          aria-invalid={shakeField}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t('unlocking') : t('unlock')}
        </button>
        <p className="app-version">{t('version', { version: getAppVersion() })}</p>
      </form>
    </div>
  );
}
