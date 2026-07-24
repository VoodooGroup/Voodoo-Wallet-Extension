import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';

const QR_SIZE = 148;

export default function Receive() {
  const { t } = useI18n();
  const { address } = useWallet();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(address, { width: QR_SIZE, margin: 1 }).then(setQr).catch(() => {});
  }, [address]);

  const copy = async () => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(t('error_copy_clipboard'));
    }
  };

  return (
    <div className="receive-page">
      <div className="card receive-card">
        <div className="label receive-label">{t('receive_address')}</div>
        <p className="receive-address" title={address}>{address}</p>
        {qr && (
          <img
            className="qr receive-qr"
            src={qr}
            alt={t('qr_alt')}
            width={QR_SIZE}
            height={QR_SIZE}
          />
        )}
        <button type="button" className="btn btn-primary receive-copy-btn" onClick={copy}>
          {copied ? t('copied') : t('copy_address')}
        </button>
        {copyError && <p className="error receive-error">{copyError}</p>}
      </div>
    </div>
  );
}
