import { assetUrl } from '../../lib/assets';

export default function WelcomeHeader({ title, tagline }) {
  return (
    <div
      className="header header-centered welcome-header"
      style={{ '--welcome-bg-image': `url("${assetUrl('voodoo-token-img.png')}")` }}
    >
      <img
        src={assetUrl('voodoo-letter-logo.png')}
        alt="Voodoo"
        className="welcome-logo"
        width={180}
        height={180}
      />
      <h1>{title}</h1>
      {tagline ? <p className="muted welcome-tagline">{tagline}</p> : null}
    </div>
  );
}