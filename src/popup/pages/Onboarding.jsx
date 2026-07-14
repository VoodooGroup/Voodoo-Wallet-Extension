import { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { assetUrl } from '../../lib/assets';
import WelcomeHeader from '../components/WelcomeHeader';
import { getAppVersion } from '../../lib/version';

export default function Onboarding({ onDone }) {
  const { createWallet, importMnemonic, importPrivateKey } = useWallet();
  const [mode, setMode] = useState('create');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phrase, setPhrase] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [wordCount, setWordCount] = useState(12);
  const [generated, setGenerated] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const validatePassword = () => {
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    if (password !== confirm) throw new Error('Passwords do not match');
  };

  const handleCreate = async () => {
    setBusy(true);
    setError('');
    try {
      validatePassword();
      const mnemonic = await createWallet(password, wordCount);
      setGenerated(mnemonic);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImportPhrase = async () => {
    setBusy(true);
    setError('');
    try {
      validatePassword();
      await importMnemonic(phrase, password);
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImportKey = async () => {
    setBusy(true);
    setError('');
    try {
      validatePassword();
      await importPrivateKey(privateKey.trim(), password);
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (generated) {
    return (
      <div className="app app-wallpaper app-auth">
        <div className="header header-centered">
          <img src={assetUrl('voodoo-wallet.png')} alt="Voodoo Wallet" className="brand-logo" width={80} height={80} />
          <h1>Save recovery phrase</h1>
        </div>
        <div className="content auth-content">
          <p className="muted">Write these words down. Anyone with this phrase controls your wallet.</p>
          <div className="card"><code>{generated}</code></div>
          <button type="button" className="btn btn-primary" onClick={() => onDone?.()}>I saved it — continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app app-wallpaper app-auth">
      <WelcomeHeader title="Welcome" tagline="Create or import a wallet" />
      <div className="content auth-content">
        <div className="tabs">
          {['create', 'import', 'privateKey'].map((m) => (
            <button key={m} type="button" className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'create' ? 'Create' : m === 'import' ? 'Import phrase' : 'Import key'}
            </button>
          ))}
        </div>

        <label className="label">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <label className="label">Confirm password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />

        {mode === 'create' && (
          <>
            <label className="label">Recovery phrase length</label>
            <select value={wordCount} onChange={(e) => setWordCount(Number(e.target.value))}>
              <option value={12}>12 words</option>
              <option value={24}>24 words</option>
            </select>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleCreate}>
              Generate wallet
            </button>
            <p className="app-version">V{getAppVersion()}</p>
          </>
        )}

        {mode === 'import' && (
          <>
            <label className="label">Recovery phrase</label>
            <textarea value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="word1, word2, word3…" />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleImportPhrase}>
              Import wallet
            </button>
            <p className="app-version">V{getAppVersion()}</p>
          </>
        )}

        {mode === 'privateKey' && (
          <>
            <label className="label">Private key</label>
            <input value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="0x…" />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleImportKey}>
              Import wallet
            </button>
            <p className="app-version">V{getAppVersion()}</p>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}