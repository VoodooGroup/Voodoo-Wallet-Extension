import { TOKEN_LOGOS } from '../config/pulsechain';
import { assetUrl } from '../lib/assets';

function isHexStyleLogo(file, symbol) {
  return file === 'pulsechain-logo.webp'
    || file === 'pulsechain-logo.png'
    || symbol === 'PLS'
    || symbol === 'WPLS'
    || (typeof file === 'string' && file.startsWith('token-') && file.endsWith('.webp'));
}

export default function TokenIcon({ symbol, logo, logoData, className = '' }) {
  const file = logo || TOKEN_LOGOS[symbol];
  const hexStyle = isHexStyleLogo(file, symbol);
  const cls = ['token-icon', hexStyle ? 'token-icon-hex' : '', className].filter(Boolean).join(' ');
  if (logoData) {
    return <img src={logoData} alt="" className={cls} />;
  }
  const src = file ? assetUrl(file) : '';
  if (src) {
    return <img src={src} alt="" className={cls} draggable={false} />;
  }
  return (
    <span className={`${cls} token-icon-symbol`} title={symbol}>
      {(symbol || '?').slice(0, 4)}
    </span>
  );
}