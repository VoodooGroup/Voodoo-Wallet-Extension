import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { FIAT_CURRENCIES } from '../../lib/fiat';
import { DEFAULT_THEME } from '../../lib/theme';
import { getAutoLockMs } from '../../lib/auto-lock';
import { openPrivacyPolicy } from '../../lib/privacy';

const FIELDS = [
  { key: 'accent', label: 'Accent / buttons' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted text' },
  { key: 'border', label: 'Borders' },
];

function SettingsBack({ onBack }) {
  return (
    <div className="settings-subnav">
      <button type="button" className="settings-back-btn" onClick={onBack}>
        <span className="settings-back-icon" aria-hidden>‹</span>
        Settings
      </button>
    </div>
  );
}

export default function Settings() {
  const { theme, setTheme, fiatCurrency, changeFiat, changePassword } = useWallet();
  const [view, setView] = useState('main');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [connectedSites, setConnectedSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  const loadConnectedSites = useCallback(() => {
    setSitesLoading(true);
    chrome.runtime.sendMessage({ type: 'DAPP_GET_CONNECTIONS' }, (res) => {
      setConnectedSites(res?.origins || []);
      setSitesLoading(false);
    });
  }, []);

  useEffect(() => {
    if (view === 'connected-sites') loadConnectedSites();
  }, [view, loadConnectedSites]);

  const disconnectSite = (origin) => {
    chrome.runtime.sendMessage({ type: 'DAPP_DISCONNECT', origin }, loadConnectedSites);
  };

  const update = (key, value) => {
    setTheme({ ...theme, [key]: value });
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from your current password');
      return;
    }

    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated successfully');
    } catch (e) {
      setPasswordError(e.message || 'Could not change password');
    } finally {
      setPasswordBusy(false);
    }
  };

  if (view === 'security-password') {
    return (
      <div className="settings-subpage">
        <SettingsBack onBack={() => setView('main')} />
        <div className="card">
          <div className="label">Security &amp; Password</div>
          <p className="muted" style={{ fontSize: 13 }}>
            Wallet auto-locks after {getAutoLockMs() / 60_000} minutes of inactivity while the popup is open.
          </p>
          <div style={{ marginTop: 16 }}>
            <div className="label">Change password</div>
            <p className="muted" style={{ fontSize: 12 }}>
              Your wallet stays unlocked. Use your new password the next time you unlock.
            </p>
            <label className="label">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <label className="label">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <label className="label">Confirm new password</label>
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
              {passwordBusy ? 'Updating…' : 'Update password'}
            </button>
            {passwordError && <p className="error">{passwordError}</p>}
            {passwordSuccess && <p className="success">{passwordSuccess}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'connected-sites') {
    return (
      <div className="settings-subpage">
        <SettingsBack onBack={() => setView('main')} />
        <div className="card">
          <div className="label">Connected sites</div>
          <p className="muted" style={{ fontSize: 13 }}>
            Sites you approved to view your wallet address. Disconnect any site you no longer use.
          </p>
          {sitesLoading && <p className="muted">Loading…</p>}
          {!sitesLoading && connectedSites.length === 0 && (
            <p className="muted" style={{ marginTop: 8 }}>No sites connected yet.</p>
          )}
          {connectedSites.map((origin) => (
            <div key={origin} className="settings-site-row">
              <span className="settings-site-origin">{origin.replace(/^https?:\/\//, '')}</span>
              <button
                type="button"
                className="btn btn-secondary settings-site-disconnect"
                onClick={() => disconnectSite(origin)}
              >
                Disconnect
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
        <div className="label">Display currency</div>
        <p className="muted">Portfolio values and token prices are shown in this currency.</p>
        <select value={fiatCurrency} onChange={(e) => changeFiat(e.target.value)}>
          {FIAT_CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.label}
              {' '}
              ({currency.code.toUpperCase()})
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="label">Wallet colours</div>
        <p className="muted">Customise the look of your wallet. Changes apply instantly.</p>
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="row" style={{ marginBottom: 8 }}>
            <span className="label" style={{ margin: 0 }}>{label}</span>
            <input
              type="color"
              value={theme[key] || DEFAULT_THEME[key]}
              onChange={(e) => update(key, e.target.value)}
              style={{ width: 48, height: 32, padding: 2, margin: 0 }}
            />
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => setTheme(DEFAULT_THEME)}>
          Reset to default
        </button>
      </div>

      <div className="card">
        <div className="label">Security &amp; Password</div>
        <button
          type="button"
          className="settings-menu-item"
          onClick={() => setView('security-password')}
        >
          <span>Password</span>
          <span className="settings-menu-chevron" aria-hidden>›</span>
        </button>
        <button
          type="button"
          className="settings-menu-item"
          onClick={() => setView('connected-sites')}
        >
          <span>Connected sites</span>
          <span className="settings-menu-chevron" aria-hidden>›</span>
        </button>
      </div>

      <div className="card">
        <div className="label">Privacy policy</div>
        <p className="muted" style={{ fontSize: 13 }}>
          How we handle your data, third-party services, and Chrome permissions.
        </p>
        <button type="button" className="btn btn-secondary" onClick={openPrivacyPolicy}>
          View privacy policy
        </button>
      </div>

      <div className="card">
        <div className="label">DApp connection</div>
        <p className="muted">
          Voodoo Wallet injects an Ethereum provider on PulseChain (chain 369).
          When a site asks to connect, click the extension icon if the popup does not open automatically.
        </p>
        <p className="muted" style={{ fontSize: 11 }}>
          Provider: <code>window.ethereum</code> · EIP-6963 compatible · PulseChain only
        </p>
      </div>
    </>
  );
}