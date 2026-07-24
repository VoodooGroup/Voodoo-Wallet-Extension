import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function SelectOptionContent({ icon, label, sublabel }) {
  return (
    <>
      {icon ? (
        <span className="popup-select-icon-wrap" aria-hidden>
          {/* Intrinsic 48px + CSS 24px = sharp on retina; avoid pixelated downscale */}
          <img
            src={icon}
            alt=""
            className="popup-select-flag"
            width={48}
            height={48}
            decoding="async"
            draggable={false}
          />
        </span>
      ) : (
        <span className="popup-select-icon-fallback" aria-hidden>
          {(label || '?').slice(0, 2)}
        </span>
      )}
      <span className="popup-select-option-text">
        <span className="popup-select-option-label">{label}</span>
        {sublabel ? (
          <span className="popup-select-option-sub">{sublabel}</span>
        ) : null}
      </span>
    </>
  );
}

function getMenuPosition(trigger, { minWidth = 140, maxMenu = 240 } = {}) {
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const pad = 8;
  const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
  const spaceAbove = rect.top - gap - pad;
  const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, Math.min(maxMenu, openUp ? spaceAbove : spaceBelow));
  const width = Math.max(rect.width, minWidth);
  const left = Math.max(pad, Math.min(rect.left, window.innerWidth - width - pad));

  return {
    position: 'fixed',
    left,
    width,
    maxHeight,
    zIndex: 10000,
    ...(openUp
      ? { bottom: window.innerHeight - rect.top + gap, top: 'auto' }
      : { top: rect.bottom + gap, bottom: 'auto' }),
  };
}

/**
 * Modern select with portal menu.
 * Auto-enables search when there are many options (custom tokens).
 */
export default function PopupSelect({
  value,
  onChange,
  options,
  ariaLabel,
  searchable = null,
  searchPlaceholder = 'Search…',
  menuMinWidth = 140,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const listboxId = useId();

  const enableSearch = searchable ?? options.length > 6;

  const selected = options.find((option) => String(option.value) === String(value))
    || options[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const label = String(opt.label || '').toLowerCase();
      const sub = String(opt.sublabel || '').toLowerCase();
      const val = String(opt.value || '').toLowerCase();
      return label.includes(q) || sub.includes(q) || val.includes(q);
    });
  }, [options, query]);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    // Taller menu when many tokens so scrolling is comfortable
    const maxMenu = options.length > 8 ? 280 : 240;
    setMenuStyle(getMenuPosition(trigger, { minWidth: menuMinWidth, maxMenu }));
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      setQuery('');
      return undefined;
    }
    updateMenuPosition();
    // Focus search so typing filters immediately with many tokens
    if (enableSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    const onReposition = () => updateMenuPosition();
    window.addEventListener('resize', onReposition);
    document.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      document.removeEventListener('scroll', onReposition, true);
    };
  }, [open, options.length, value, enableSearch, menuMinWidth]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      const t = event.target;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const handleSelect = (event, nextValue) => {
    event.preventDefault();
    event.stopPropagation();
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  };

  const menu = open && menuStyle
    ? createPortal(
      <div
        ref={menuRef}
        className={[
          'popup-select-menu-wrap',
          enableSearch ? 'has-search' : '',
          className ? `${className}-menu` : '',
        ].filter(Boolean).join(' ')}
        style={menuStyle}
      >
        {enableSearch && (
          <div className="popup-select-search">
            <input
              ref={searchRef}
              type="search"
              className="popup-select-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <ul
          id={listboxId}
          className="popup-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {filtered.length === 0 && (
            <li className="popup-select-empty" role="presentation">
              No matches
            </li>
          )}
          {filtered.map((option) => (
            <li key={String(option.value)} role="none">
              <button
                type="button"
                role="option"
                aria-selected={String(option.value) === String(value)}
                className={`popup-select-option${String(option.value) === String(value) ? ' active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => handleSelect(e, option.value)}
              >
                <SelectOptionContent
                  icon={option.icon}
                  label={option.label}
                  sublabel={option.sublabel}
                />
              </button>
            </li>
          ))}
        </ul>
      </div>,
      document.body,
    )
    : null;

  const rootClass = [
    'popup-select',
    open ? 'popup-select-open' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={rootClass}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="popup-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span className="popup-select-trigger-main">
          <SelectOptionContent
            icon={selected?.icon}
            label={selected?.label}
          />
        </span>
        <span className="popup-select-chevron" aria-hidden>▾</span>
      </button>
      {menu}
    </div>
  );
}
