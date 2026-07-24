import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { DEFAULT_LOCALE, isRtlLocale } from '../lib/i18n/locales';
import { translate } from '../lib/i18n';
import { getPrefs, getWalletState, setPrefs, setWalletState } from '../lib/storage';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [prefs, wallet] = await Promise.all([
          getPrefs().catch(() => ({})),
          getWalletState().catch(() => null),
        ]);
        const saved = wallet?.locale || prefs.locale || DEFAULT_LOCALE;
        setLocaleState(saved);
      } catch {
        setLocaleState(DEFAULT_LOCALE);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  const setLocale = useCallback(async (next) => {
    setLocaleState(next);
    await setPrefs({ locale: next });
    try {
      const wallet = await getWalletState();
      if (wallet) {
        await setWalletState({ ...wallet, locale: next });
      }
    } catch {
      /* prefs are enough */
    }
  }, []);

  const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, ready }), [locale, setLocale, t, ready]);

  if (!ready) {
    return <div className="app"><div className="content muted">{translate(DEFAULT_LOCALE, 'loading')}</div></div>;
  }

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}