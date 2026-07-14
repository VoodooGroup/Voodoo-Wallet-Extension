import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useWallet } from '../../context/WalletContext';

export default function Receive() {
  const { address } = useWallet();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(address, { width: 180, margin: 1 }).then(setQr);
  }, [address]);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="label">Your PulseChain address</div>
      <p style={{ wordBreak: 'break-all', fontSize: 12 }}>{address}</p>
      {qr && <img className="qr" src={qr} alt="QR code" width={180} height={180} />}
      <button type="button" className="btn btn-primary" onClick={copy}>
        {copied ? 'Copied!' : 'Copy address'}
      </button>
    </div>
  );
}