import {
  lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { I18nProvider, useI18n } from '../context/I18nContext.jsx';
import { WalletProvider, useWallet } from '../context/WalletContext';
import { ProfilePictureProvider, useProfilePicture } from '../context/ProfilePictureContext.jsx';
import ErrorBoundary from './ErrorBoundary';
import Onboarding from './pages/Onboarding';
import Unlock from './pages/Unlock';
import HeaderMenu from './components/HeaderMenu';
import MenuInsightsPanel from './components/MenuInsightsPanel';
import { appBrandLogoUrl, pulsechainLogoUrl } from '../lib/assets';
import { applyTheme } from '../lib/theme';
import { getAutoLockMs } from '../lib/auto-lock';
import { getSession, touchSession } from '../lib/session';
import { getAppVersion } from '../lib/version';
import { TabNavProvider } from '../context/TabNavContext.jsx';
import { sendRuntimeMessage } from '../lib/runtime-message.js';

const Home = lazy(() => import('./pages/Home'));
const Swap = lazy(() => import('./pages/Swap'));
const Send = lazy(() => import('./pages/Send'));
const Receive = lazy(() => import('./pages/Receive'));
const Stake = lazy(() => import('./pages/Stake'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Activity = lazy(() => import('./pages/Activity'));
const Settings = lazy(() => import('./pages/Settings'));
const ImportWallet = lazy(() => import('./pages/ImportWallet'));
const DappPrompt = lazy(() => import('./components/DappPrompt'));

function BootShell() {
  const { t } = useI18n();
  return (
    <div className="app app-boot">
      <div className="header">
        <div className="header-inner">
          <div className="header-brand">
            <img
              src={appBrandLogoUrl()}
              alt={t('app_name')}
              className="header-brand-logo"
              width={52}
              height={52}
            />
            <div>
              <h1>{t('app_name')}</h1>
              <p className="header-network">
                <img
                  src={pulsechainLogoUrl()}
                  alt={t('pulsechain')}
                  className="header-network-logo"
                  width={20}
                  height={20}
                  draggable={false}
                />
                {t('pulsechain')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { t } = useI18n();
  const {
    loading, unlocked, hasWallet, theme, lock,
  } = useWallet();
  const { profilePicture } = useProfilePicture();
  const [tab, setTab] = useState('home');
  const [importOpen, setImportOpen] = useState(false);
  const [insightsView, setInsightsView] = useState(null);
  const lastActivity = useRef(Date.now());
  const shellRef = useRef(null);
  const headerRef = useRef(null);
  const navRef = useRef(null);

  const bumpActivity = useCallback(() => {
    if (!unlocked) return;
    lastActivity.current = Date.now();
    touchSession();
  }, [unlocked]);

  /** Measure chrome so modals center between header and bottom nav (no grey over nav). */
  useLayoutEffect(() => {
    if (!unlocked) return undefined;
    const applyChromeMetrics = () => {
      const headerH = headerRef.current?.offsetHeight ?? 81;
      const navH = navRef.current?.offsetHeight ?? 132;
      const root = document.documentElement;
      root.style.setProperty('--app-header-h', `${headerH}px`);
      root.style.setProperty('--app-nav-h', `${navH}px`);
      if (shellRef.current) {
        shellRef.current.style.setProperty('--app-header-h', `${headerH}px`);
        shellRef.current.style.setProperty('--app-nav-h', `${navH}px`);
      }
    };
    applyChromeMetrics();
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(applyChromeMetrics)
      : null;
    if (headerRef.current) ro?.observe(headerRef.current);
    if (navRef.current) ro?.observe(navRef.current);
    window.addEventListener('resize', applyChromeMetrics);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', applyChromeMetrics);
    };
  }, [unlocked, tab, insightsView]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!unlocked) return;
    import('./pages/Stake');
    import('./pages/Swap');
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return undefined;
    bumpActivity();
    const id = setInterval(async () => {
      const session = await getSession();
      const lastActive = session?.unlockedAt || lastActivity.current;
      if (Date.now() - lastActive >= getAutoLockMs()) {
        lock();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [unlocked, lock, bumpActivity]);

  /**
   * Leave the current flow: cancel any open dApp approve/connect (site gets 4001),
   * keep the wallet popup open, and clear the overlay UI.
   * MUST stay above early returns — hooks cannot run after conditional returns (React #310).
   */
  const dismissDappPromptAsCancel = useCallback(() => {
    sendRuntimeMessage({ type: 'DAPP_REJECT_SIGN', closeWindow: false });
    sendRuntimeMessage({ type: 'DAPP_REJECT_CONNECT', closeWindow: false });
    try {
      window.dispatchEvent(new CustomEvent('voodoo:nav-away'));
    } catch {
      /* ignore */
    }
  }, []);

  /** Switch bottom-nav tab. Any open dApp approve/connect is treated as Cancel. */
  const setTabActive = useCallback((id) => {
    bumpActivity();
    dismissDappPromptAsCancel();
    setTab(id);
  }, [bumpActivity, dismissDappPromptAsCancel]);

  if (loading) {
    return <BootShell />;
  }

  if (!hasWallet) return <Onboarding />;
  if (!unlocked) return <Unlock />;

  const tabPanels = {
    home: Home,
    swap: Swap,
    send: Send,
    receive: Receive,
    stake: Stake,
    activity: Activity,
    accounts: Accounts,
    settings: Settings,
  };
  const ActivePage = tabPanels[tab] || Home;

  return (
    <TabNavProvider navigate={setTabActive}>
    <div className="app app-shell" ref={shellRef}>
      <div className="header" ref={headerRef}>
        <div className="header-inner">
          <div className="header-brand">
            <img
              src={profilePicture || appBrandLogoUrl()}
              alt={t('app_name')}
              className={`header-brand-logo${profilePicture ? ' is-profile' : ''}`}
              width={52}
              height={52}
              draggable={false}
            />
            <div>
              <h1>{t('app_name')}</h1>
              <p className="header-network">
                <img
                  src={pulsechainLogoUrl()}
                  alt={t('pulsechain')}
                  className="header-network-logo"
                  width={20}
                  height={20}
                  draggable={false}
                />
                {t('pulsechain')}
              </p>
            </div>
          </div>
          <HeaderMenu
            onImportWallet={() => {
              dismissDappPromptAsCancel();
              setImportOpen(true);
            }}
            onOpenInsights={(view) => {
              dismissDappPromptAsCancel();
              setInsightsView(view);
            }}
          />
        </div>
      </div>
      {/* After header so connect/sign UI never sits above the brand bar */}
      <Suspense fallback={null}>
        <DappPrompt />
      </Suspense>
      {importOpen && (
        <Suspense fallback={null}>
          <ImportWallet onClose={() => setImportOpen(false)} />
        </Suspense>
      )}
      {insightsView && (
        <MenuInsightsPanel
          view={insightsView}
          onClose={() => setInsightsView(null)}
          onGoStake={() => {
            setInsightsView(null);
            setTabActive('stake');
          }}
        />
      )}
      <div className="app-scroll" onClick={bumpActivity} onKeyDown={bumpActivity} role="presentation">
        <Suspense fallback={<BootShell />}>
          <div
            className={[
              'content',
              tab === 'swap' ? 'content-swap' : '',
              tab === 'receive' ? 'content-receive' : '',
            ].filter(Boolean).join(' ')}
          >
            <ActivePage />
          </div>
        </Suspense>
      </div>
      <div className="nav" ref={navRef}>
        <div className="nav-row">
          {[
            ['home', 'nav_home'],
            ['swap', 'nav_swap'],
            ['send', 'nav_send'],
            ['receive', 'nav_receive'],
          ].map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'active' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onMouseEnter={id === 'swap' ? () => import('./pages/Swap') : undefined}
              onFocus={id === 'swap' ? () => import('./pages/Swap') : undefined}
              onClick={() => setTabActive(id)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="nav-row nav-row-secondary">
          {[
            ['stake', 'nav_stake'],
            ['activity', 'nav_activity'],
            ['accounts', 'nav_accounts'],
            ['settings', 'nav_settings'],
          ].map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'active' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onMouseEnter={id === 'stake' ? () => import('./pages/Stake') : undefined}
              onFocus={id === 'stake' ? () => import('./pages/Stake') : undefined}
              onClick={() => setTabActive(id)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <p className="nav-version">{t('version', { version: getAppVersion() })}</p>
      </div>
    </div>
    </TabNavProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <WalletProvider>
          <ProfilePictureProvider>
            <Shell />
          </ProfilePictureProvider>
        </WalletProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}