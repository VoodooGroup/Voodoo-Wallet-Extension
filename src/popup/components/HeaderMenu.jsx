import { useEffect, useRef, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { openFullscreenWallet } from '../../lib/fullscreen';

export default function HeaderMenu() {
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

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        type="button"
        className="header-menu-btn"
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span className="header-menu-line" />
        <span className="header-menu-line" />
        <span className="header-menu-line" />
      </button>

      {open && (
        <div className="header-menu-dropdown" role="menu">
          <button
            type="button"
            className="header-menu-item"
            role="menuitem"
            onClick={openFullscreen}
          >
            Full screen
          </button>
          <button
            type="button"
            className="header-menu-item"
            role="menuitem"
            onClick={handleLock}
          >
            Lock
          </button>
        </div>
      )}
    </div>
  );
}