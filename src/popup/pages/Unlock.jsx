import { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import WelcomeHeader from '../components/WelcomeHeader';
import { getAppVersion } from '../../lib/version';

export default function Unlock({ onUnlocked }) {
  const { unlock } = useWallet();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await unlock(password);
      onUnlocked?.();
    } catch {
      setError('Wrong password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app app-wallpaper app-auth">
      <WelcomeHeader
        title="Unlock wallet"
        tagline="Enter your password to continue"
      />
      <form className="content auth-content" onSubmit={submit}>
        <label className="label">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <button type="submit" className="btn btn-primary" disabled={busy}>Unlock</button>
        <p className="app-version">V{getAppVersion()}</p>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}