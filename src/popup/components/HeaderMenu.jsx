import { useEffect, useRef, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import {
  menuFullscreenIconUrl,
  menuGasIconUrl,
  menuImportIconUrl,
  menuLockIconUrl,
  menuUnlocksIconUrl,
  menuYieldsIconUrl,
} from '../../lib/assets';
import { openFullscreenWallet } from '../../lib/fullscreen';

function MenuItem({
  iconSrc, onClick, children,
}) {
  return (
    <button type="button" className="header-menu-item" role="menuitem" onClick={onClick}>
      <img src={iconSrc} alt="" className="header-menu-icon" aria-hidden="true" />
      <span className="header-menu-label">{children}</span>
    </button>
  );
}

export default function HeaderMenu({ onImportWallet, onOpenInsights }) {
  const { t } = useI18n();
  const { lock } = useWallet();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openFullscreen = (event) => {
    event.stopPropagation();
    setOpen(false);
    openFullscreenWallet();
  };

  const handleLock = (event) => {
    event.stopPropagation();
    setOpen(false);
    lock();
  };

  const handleImport = (event) => {
    event.stopPropagation();
    setOpen(false);
    onImportWallet?.();
  };

  const handleInsights = (event, view) => {
    event.stopPropagation();
    setOpen(false);
    onOpenInsights?.(view);
  };

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        type="button"
        className="header-menu-btn"
        aria-label={t('menu_open')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => {
            const next = !prev;
            // Notify overlays (e.g. staking calculator) so they don't cover the menu
            if (next) {
              window.dispatchEvent(new CustomEvent('voodoo:header-menu-open'));
            }
            return next;
          });
        }}
      >
        <span className="header-menu-line" />
        <span className="header-menu-line" />
        <span className="header-menu-line" />
      </button>

      {open && (
        <div className="header-menu-dropdown" role="menu">
          <MenuItem iconSrc={menuUnlocksIconUrl()} onClick={(e) => handleInsights(e, 'unlocks')}>
            {t('menu_upcoming_unlocks')}
          </MenuItem>
          <MenuItem iconSrc={menuGasIconUrl()} onClick={(e) => handleInsights(e, 'gas')}>
            {t('menu_gas_spending')}
          </MenuItem>
          <MenuItem iconSrc={menuYieldsIconUrl()} onClick={(e) => handleInsights(e, 'yields')}>
            {t('menu_recent_yields')}
          </MenuItem>
          <MenuItem iconSrc={menuImportIconUrl()} onClick={handleImport}>
            {t('menu_import_wallet')}
          </MenuItem>
          <MenuItem iconSrc={menuFullscreenIconUrl()} onClick={openFullscreen}>
            {t('menu_fullscreen')}
          </MenuItem>
          <MenuItem iconSrc={menuLockIconUrl()} onClick={handleLock}>
            {t('lock')}
          </MenuItem>
        </div>
      )}
    </div>
  );
}