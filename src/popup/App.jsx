import {
  lazy, Suspense, useCallback, useEffect, useRef, useState,
} from 'react';
import { WalletProvider, useWallet } from '../context/WalletContext';
import ErrorBoundary from './ErrorBoundary';
import Onboarding from './pages/Onboarding';
import Unlock from './pages/Unlock';
import HeaderMenu from './components/HeaderMenu';
import { assetUrl, pulsechainLogoUrl } from '../lib/assets';
import { applyTheme } from '../lib/theme';
import { getAutoLockMs } from '../lib/auto-lock';
import { getSession, touchSession } from '../lib/session';
import { getAppVersion } from '../lib/version';

const Home = lazy(() => import('./pages/Home'));
const Send = lazy(() => import('./pages/Send'));
const Receive = lazy(() => import('./pages/Receive'));
const Stake = lazy(() => import('./pages/Stake'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Activity = lazy(() => import('./pages/Activity'));
const Settings = lazy(() => import('./pages/Settings'));
const DappPrompt = lazy(() => import('./components/DappPrompt'));

function BootShell() {
  return (
    <div className="app app-boot">
      <div className="header">
        <div className="header-inner">
          <div className="header-brand">
            <img
              src={assetUrl('voodoo-wallet.png')}
              alt="Voodoo Wallet"
              className="header-brand-logo"
              width={52}
              height={52}
            />
            <div>
              <h1>Voodoo Wallet</h1>
              <p className="header-network">
                <img
                  src={pulsechainLogoUrl()}
                  alt="PulseChain"
                  className="header-network-logo"
                  width={20}
                  height={20}
                  draggable={false}
                />
                PulseChain
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const {
    loading, unlocked, hasWallet, theme, lock,
  } = useWallet();
  const [tab, setTab] = useState('home');
  const lastActivity = useRef(Date.now());

  const bumpActivity = useCallback(() => {
    if (!unlocked) return;
    lastActivity.current = Date.now();
    touchSession();
  }, [unlocked]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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

  if (loading) {
    return <BootShell />;
  }

  if (!hasWallet) return <Onboarding />;
  if (!unlocked) return <Unlock />;

  const pages = {
    home: <Home />,
    send: <Send />,
    receive: <Receive />,
    stake: <Stake />,
    activity: <Activity />,
    accounts: <Accounts />,
    settings: <Settings />,
  };

  const setTabActive = (id) => {
    bumpActivity();
    setTab(id);
  };

  return (
    <div className="app app-shell">
      <Suspense fallback={null}>
        <DappPrompt />
      </Suspense>
      <div className="header">
        <div className="header-inner">
          <div className="header-brand">
            <img
              src={assetUrl('voodoo-wallet.png')}
              alt="Voodoo Wallet"
              className="header-brand-logo"
              width={52}
              height={52}
            />
            <div>
              <h1>Voodoo Wallet</h1>
              <p className="header-network">
                <img
                  src={pulsechainLogoUrl()}
                  alt="PulseChain"
                  className="header-network-logo"
                  width={20}
                  height={20}
                  draggable={false}
                />
                PulseChain
              </p>
            </div>
          </div>
          <HeaderMenu />
        </div>
      </div>
      <div className="app-scroll" onClick={bumpActivity} onKeyDown={bumpActivity} role="presentation">
        <Suspense fallback={<BootShell />}>
          <div className="content">{pages[tab]}</div>
        </Suspense>
      </div>
      <div className="nav">
        <div className="nav-row">
          {[
            ['home', 'Home'],
            ['send', 'Send'],
            ['receive', 'Receive'],
            ['stake', 'Stake'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTabActive(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="nav-row nav-row-secondary">
          {[
            ['activity', 'Activity'],
            ['accounts', 'Accounts'],
            ['settings', 'Settings'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTabActive(id)}>
              {label}
            </button>
          ))}
        </div>
        <p className="nav-version">V{getAppVersion()}</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <Shell />
      </WalletProvider>
    </ErrorBoundary>
  );
}