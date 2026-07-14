import { useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { shortenAddress } from '../../lib/wallet';

export default function Accounts() {
  const {
    accounts, activeAccountId, address, switchAccount, addAccount, renameAccount,
    exportPrivateKey, resetWallet, lock, vault,
  } = useWallet();
  const [renameId, setRenameId] = useState('');
  const [renameVal, setRenameVal] = useState('');
  const [exportPw, setExportPw] = useState('');
  const [exported, setExported] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!exported) return undefined;
    const id = setTimeout(() => {
      setExported('');
      setShowKey(false);
    }, 60_000);
    return () => clearTimeout(id);
  }, [exported]);

  const doRename = async () => {
    if (!renameId || !renameVal) return;
    await renameAccount(renameId, renameVal);
    setRenameId('');
    setRenameVal('');
  };

  const doExport = async () => {
    setError('');
    setExported('');
    setShowKey(false);
    if (!confirm('Never share your private key. Anyone with it controls your funds. Continue?')) return;
    try {
      const pk = await exportPrivateKey(exportPw);
      setExported(pk);
      setShowKey(false);
      setExportPw('');
    } catch {
      setError('Wrong password');
    }
  };

  const copyKey = async () => {
    if (!exported) return;
    try {
      await navigator.clipboard.writeText(exported);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  const doReset = async () => {
    if (!confirm('Delete wallet from this extension? Make sure you have your recovery phrase.')) return;
    await resetWallet();
    lock();
    window.location.reload();
  };

  return (
    <>
      <div className="card">
        <div className="label">Accounts</div>
        {accounts.map((a) => (
          <div key={a.id} className="token-item" style={{ marginBottom: 6 }}>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer', flex: 1 }}
              onClick={() => switchAccount(a.id)}
            >
              <div>{a.name} {a.id === activeAccountId ? '· active' : ''}</div>
              {a.id === activeAccountId && <div className="muted">{shortenAddress(address, 8)}</div>}
            </button>
          </div>
        ))}
        {vault?.type === 'mnemonic' && (
          <button type="button" className="btn btn-secondary" onClick={addAccount}>Add account</button>
        )}
      </div>

      <div className="card">
        <div className="label">Rename account</div>
        <select value={renameId} onChange={(e) => setRenameId(e.target.value)}>
          <option value="">Select</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} placeholder="New name" />
        <button type="button" className="btn btn-secondary" onClick={doRename}>Save name</button>
      </div>

      <div className="card">
        <div className="label">Export private key</div>
        <p className="muted" style={{ fontSize: 12 }}>Only export if you need to import elsewhere. Key auto-hides after 60 seconds.</p>
        <input type="password" value={exportPw} onChange={(e) => setExportPw(e.target.value)} placeholder="Password" />
        <button type="button" className="btn btn-secondary" onClick={doExport}>Reveal key</button>
        {exported && (
          <div className="export-key-box">
            <p className="muted" style={{ fontSize: 11 }}>
              {showKey ? exported : '••••••••••••••••••••••••••••••••'}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setShowKey((s) => !s)}>
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={copyKey}>Copy</button>
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <button type="button" className="btn btn-danger" onClick={doReset}>Reset wallet</button>
    </>
  );
}