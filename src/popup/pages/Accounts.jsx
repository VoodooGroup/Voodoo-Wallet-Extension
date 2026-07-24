import { useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { shortenAddress } from '../../lib/wallet';
import { resetButtonIconUrl } from '../../lib/assets';

export default function Accounts() {
  const { t } = useI18n();
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
    if (!confirm(t('confirm_export'))) return;
    try {
      const pk = await exportPrivateKey(exportPw);
      setExported(pk);
      setShowKey(false);
      setExportPw('');
    } catch {
      setError(t('error_wrong_password'));
    }
  };

  const copyKey = async () => {
    if (!exported) return;
    try {
      await navigator.clipboard.writeText(exported);
    } catch {
      setError(t('error_copy_clipboard'));
    }
  };

  const doReset = async () => {
    if (!confirm(t('confirm_reset'))) return;
    await resetWallet();
    lock();
    window.location.reload();
  };

  return (
    <>
      <div className="card">
        <div className="label">{t('accounts_title')}</div>
        {accounts.map((a) => (
          <div key={a.id} className="token-item" style={{ marginBottom: 6 }}>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer', flex: 1 }}
              onClick={() => switchAccount(a.id)}
            >
              <div>{a.name} {a.id === activeAccountId ? `· ${t('active')}` : ''}</div>
              {a.id === activeAccountId && <div className="muted">{shortenAddress(address, 8)}</div>}
            </button>
          </div>
        ))}
        {vault?.type === 'mnemonic' && (
          <button type="button" className="btn btn-secondary" onClick={addAccount}>{t('add_account')}</button>
        )}
      </div>

      <div className="card">
        <div className="label">{t('rename_account')}</div>
        <select value={renameId} onChange={(e) => setRenameId(e.target.value)}>
          <option value="">{t('select')}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} placeholder={t('placeholder_name')} />
        <button type="button" className="btn btn-secondary" onClick={doRename}>{t('save_name')}</button>
      </div>

      <div className="card">
        <div className="label">{t('export_private_key')}</div>
        <p className="muted" style={{ fontSize: 12 }}>{t('export_warning')}</p>
        <input type="password" value={exportPw} onChange={(e) => setExportPw(e.target.value)} placeholder={t('placeholder_password')} />
        <button type="button" className="btn btn-secondary" onClick={doExport}>{t('reveal_key')}</button>
        {exported && (
          <div className="export-key-box">
            <p className="muted" style={{ fontSize: 11 }}>
              {showKey ? exported : '••••••••••••••••••••••••••••••••'}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setShowKey((s) => !s)}>
                {showKey ? t('hide') : t('show')}
              </button>
              <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={copyKey}>{t('copy')}</button>
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <button type="button" className="btn btn-danger btn-with-icon" onClick={doReset}>
        <span
          className="btn-icon btn-icon-mask"
          style={{ WebkitMaskImage: `url(${resetButtonIconUrl()})`, maskImage: `url(${resetButtonIconUrl()})` }}
          aria-hidden="true"
        />
        <span>{t('reset_wallet')}</span>
      </button>
    </>
  );
}