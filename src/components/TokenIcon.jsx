import { TOKEN_LOGOS } from '../config/pulsechain';
import { assetUrl } from '../lib/assets';

function isHexStyleLogo(file, symbol) {
  return file === 'pulsechain-logo.webp'
    || file === 'pulsechain-logo.png'
    || file === 'pulsechain-logo-40.png'
    || file === 'pulsechain-logo-64.png'
    || symbol === 'PLS'
    || symbol === 'WPLS'
    || (typeof file === 'string' && file.startsWith('token-') && file.endsWith('.webp'));
}

export default function TokenIcon({
  symbol, logo, logoData, className = '', lazy = false,
}) {
  const file = logo || TOKEN_LOGOS[symbol];
  const hexStyle = isHexStyleLogo(file, symbol);
  const cls = ['token-icon', hexStyle ? 'token-icon-hex' : '', className].filter(Boolean).join(' ');
  const imgProps = {
    alt: '',
    className: cls,
    draggable: false,
    ...(lazy ? { loading: 'lazy', decoding: 'async' } : {}),
  };

  if (logoData) {
    return <img src={logoData} {...imgProps} />;
  }
  const src = file ? assetUrl(file) : '';
  if (src) {
    return <img src={src} {...imgProps} />;
  }
  return (
    <span className={`${cls} token-icon-symbol`} title={symbol}>
      {(symbol || '?').slice(0, 4)}
    </span>
  );
}