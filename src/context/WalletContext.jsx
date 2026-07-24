import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { getEcosystemToken } from '../config/ecosystem-tokens';
import { defaultAccounts } from '../lib/accounts';
import { encryptVault, decryptVault } from '../lib/vault';
import {
  getIncomingNotifyEnabled,
  getPriceAlerts,
  getPriceAlertsEnabled,
  getWalletState,
  setWalletState,
  clearWalletState,
  setPriceAlerts,
  setPriceAlertsEnabled,
  INCOMING_NOTIFY_KEY,
  PRICE_ALERTS_ENABLED_KEY,
  PRICE_ALERTS_KEY,
} from '../lib/storage';
import {
  createPriceAlertId,
  defaultAlertDirection,
  normalizePriceAlert,
} from '../lib/price-alerts.js';
import { normalizeFiatCode, portfolioFiatValue } from '../lib/fiat';
import { isValidAddress } from '../lib/validate';

function sanitizeNftCollections(collections) {
  return (collections || []).filter((item) => (item?.address || '').trim());
}
import { DEFAULT_THEME, applyTheme, normalizeTheme } from '../lib/theme';
import { getAllTokenLogos, saveTokenLogo } from '../lib/token-logos';
import {
  SESSION_KEY,
  clearSession,
  setSessionTotpSecret,
  disableSessionWrites,
  enableSessionWrites,
  getSession,
  isSessionValid,
  saveSession,
} from '../lib/session';
import { persistIncomingNotifications, syncWatchedAccounts } from '../lib/watch-accounts.js';
import { sendRuntimeMessage } from '../lib/runtime-message.js';
import { toggleStarredAddress } from '../lib/token-sort.js';
// DEV_DEMO_BALANCE — remove with src/lib/dev-demo-balance.js
import {
  getDevDemoBalanceEnabled,
  setDevDemoBalanceEnabled as persistDevDemoBalanceEnabled,
  applyDevDemoDisplay,
} from '../lib/dev-demo-balance.js';

const WalletContext = createContext(null);

function syncDappAddress(addr) {
  // Prefer awaitable path so unlock can finish pending dApp connect before UI continues
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'WALLET_SET_ACTIVE', address: addr || null },
          () => {
            void chrome.runtime.lastError;
            resolve();
          },
        );
      } catch {
        resolve();
      }
    });
  }
  sendRuntimeMessage({ type: 'WALLET_SET_ACTIVE', address: addr || null });
  return Promise.resolve();
}

function syncWatchAccountsQuiet(vault, accs) {
  if (!vault || !accs?.length) return;
  syncWatchedAccounts(vault, accs).catch(() => {});
}

function prefetchStakeQuiet(addr) {
  if (!addr) return;
  import('../lib/staking.js').then(({ prefetchStakeData }) => {
    prefetchStakeData(addr).catch(() => {});
  });
}

export function WalletProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [vault, setVault] = useState(null);
  const [accounts, setAccounts] = useState(defaultAccounts());
  const [activeAccountId, setActiveAccountId] = useState('0');
  const [customTokens, setCustomTokens] = useState([]);
  const [starredTokenAddresses, setStarredTokenAddresses] = useState([]);
  const [nftCollections, setNftCollections] = useState([]);
  const [fiatCurrency, setFiatCurrency] = useState('usd');
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState('');
  const [plsBalance, setPlsBalance] = useState('0');
  const [tokens, setTokens] = useState([]);
  const [nfts, setNfts] = useState([]);
  const [prices, setPrices] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setThemeState] = useState(DEFAULT_THEME);
  const [tokenLogos, setTokenLogos] = useState({});
  const [incomingNotifications, setIncomingNotifications] = useState(false);
  const [priceAlertsEnabled, setPriceAlertsEnabledState] = useState(false);
  const [priceAlerts, setPriceAlertsState] = useState([]);
  // DEV_DEMO_BALANCE — remove with src/lib/dev-demo-balance.js
  const [devDemoBalance, setDevDemoBalanceState] = useState(false);
  const incomingNotifyPersistingRef = useRef(false);
  const priceAlertsPersistingRef = useRef(false);
  /** Avoid putting plsBalance in refresh deps (recreated callback re-ran wallet boot). */
  const plsBalanceRef = useRef(plsBalance);
  plsBalanceRef.current = plsBalance;
  const bootStartedRef = useRef(false);
  /** Only the latest refresh may clear the spinner (prevents stuck loading). */
  const refreshGenRef = useRef(0);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) || accounts[0],
    [accounts, activeAccountId],
  );

  /** Show token rows immediately so Home is never blank while RPC loads. */
  const seedTokenList = useCallback((customs = customTokens, logos = tokenLogos) => {
    import('../lib/chain').then(({ buildTokenListSkeleton }) => {
      setTokens((prev) => (prev.length > 0 ? prev : buildTokenListSkeleton(customs, logos)));
    }).catch(() => {});
  }, [customTokens, tokenLogos]);

  const persistMeta = useCallback(async (patch, encryptedVault) => {
    const current = (await getWalletState()) || {};
    await setWalletState({
      ...current,
      ...patch,
      vault: encryptedVault || current.vault,
    });
  }, []);

  const loadSigner = useCallback(async (decryptedVault, account) => {
    const { deriveAccountFromMnemonic, walletFromPrivateKey } = await import('../lib/wallet');
    if (decryptedVault.type === 'mnemonic') {
      const w = await deriveAccountFromMnemonic(decryptedVault.secret, account.derivationIndex);
      setSigner(w);
      setAddress(w.address);
      return w;
    }
    const w = walletFromPrivateKey(decryptedVault.secret);
    setSigner(w);
    setAddress(w.address);
    return w;
  }, []);

  const refresh = useCallback(async (addr = address, overrides = {}) => {
    if (!addr) return;
    const tokensMeta = overrides.customTokens ?? customTokens;
    const logos = overrides.tokenLogos ?? tokenLogos;
    const collections = overrides.nftCollections ?? nftCollections;
    const currency = overrides.fiatCurrency ?? fiatCurrency;
    // silent = do not throw to caller (session restore / background loads).
    const silent = overrides.silent ?? false;

    const gen = refreshGenRef.current + 1;
    refreshGenRef.current = gen;
    const isCurrent = () => refreshGenRef.current === gen;

    setRefreshing(true);

    // Prices ALWAYS start immediately — never gated on balances / isCurrent mid-flight.
    const pricesPromise = import('../lib/prices')
      .then(({ fetchFiatPrices }) => fetchFiatPrices(currency, { bypassCache: false }))
      .catch((err) => {
        console.warn('Price refresh failed:', err?.message || err);
        return null;
      });

    // Apply prices as soon as ready (don't wait for slow RPC balances).
    pricesPromise.then((fiat) => {
      if (!isCurrent() || !fiat || typeof fiat !== 'object') return;
      const hasPrice = ['VDO', 'PLS', 'WPLS', 'MAGIC', 'POISON']
        .some((k) => Number(fiat[k]) > 0);
      if (hasPrice) setPrices(fiat);
    });

    const nftsPromise = import('../lib/nft')
      .then(({ fetchAllNfts }) => fetchAllNfts(addr, collections))
      .catch(() => []);

    let balances = null;
    let balanceError = null;
    try {
      const { buildTokenListSkeleton, fetchAllBalances } = await import('../lib/chain');
      setTokens((prev) => (
        prev.length > 0 ? prev : buildTokenListSkeleton(tokensMeta, logos)
      ));

      const BALANCE_PHASE_MS = 18_000;
      balances = await Promise.race([
        fetchAllBalances(addr, tokensMeta, logos),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Balance refresh timed out')), BALANCE_PHASE_MS);
        }),
      ]);

      if (isCurrent()) {
        if (!balances.plsStale && balances.pls != null) {
          setPlsBalance(balances.pls);
        } else if (balances.plsStale && balances.plsError && !silent) {
          console.warn('PLS balance refresh failed:', balances.plsError?.message || balances.plsError);
        }
        if (Array.isArray(balances.tokens) && balances.tokens.length > 0) {
          setTokens((prev) => {
            if (!prev.length) return balances.tokens;
            const nextByAddr = new Map(
              balances.tokens.map((tok) => [(tok.address || '').toLowerCase(), tok]),
            );
            const merged = prev.map((tok) => {
              const key = (tok.address || '').toLowerCase();
              return nextByAddr.get(key) || tok;
            });
            balances.tokens.forEach((tok) => {
              const key = (tok.address || '').toLowerCase();
              if (!merged.some((m) => (m.address || '').toLowerCase() === key)) {
                merged.push(tok);
              }
            });
            return merged;
          });

          // Heal stored custom-token decimals when on-chain values differ
          try {
            const { healCustomTokensDecimals } = await import('../lib/token-decimals.js');
            const healed = healCustomTokensDecimals(tokensMeta, balances.tokens);
            if (healed) {
              setCustomTokens(healed);
              await persistMeta({ customTokens: healed });
            }
          } catch {
            /* non-fatal */
          }
        }
      }
    } catch (err) {
      balanceError = err;
      if (isCurrent()) {
        try {
          const { buildTokenListSkeleton } = await import('../lib/chain');
          setTokens((prev) => (
            prev.length > 0 ? prev : buildTokenListSkeleton(tokensMeta, logos)
          ));
        } catch { /* ignore */ }
        console.warn('Background refresh failed:', err?.message || err);
      }
    } finally {
      if (isCurrent()) setRefreshing(false);
    }

    // Ensure prices/NFTs settled (prices may already be applied above).
    try {
      const [fiat, nftList] = await Promise.all([pricesPromise, nftsPromise]);
      if (isCurrent()) {
        if (fiat && typeof fiat === 'object') {
          const hasPrice = ['VDO', 'PLS', 'WPLS', 'MAGIC', 'POISON']
            .some((k) => Number(fiat[k]) > 0);
          if (hasPrice) setPrices(fiat);
        }
        if (Array.isArray(nftList)) setNfts(nftList);

        if (fiat && typeof fiat === 'object') {
          const plsForPortfolio = (balances && !balances.plsStale && balances.pls != null)
            ? balances.pls
            : plsBalanceRef.current;
          const tokenRows = balances?.tokens || [];
          const total = portfolioFiatValue(
            { pls: plsForPortfolio, tokens: tokenRows },
            fiat,
          );
          import('../lib/portfolio-history').then(({ recordPortfolioSnapshot }) => {
            recordPortfolioSnapshot(addr, total, currency).catch(() => {});
          });
        }
      }
    } catch (err) {
      if (isCurrent()) {
        console.warn('Secondary refresh failed:', err?.message || err);
      }
    }

    if (balanceError && !silent && isCurrent()) {
      throw balanceError;
    }
  }, [address, customTokens, fiatCurrency, nftCollections, tokenLogos]);

  const restoreUnlockedSession = useCallback(async (state, sessionVault) => {
    const accs = state.accounts || defaultAccounts();
    const acc = accs.find((a) => a.id === (state.activeAccountId || '0')) || accs[0];
    const customs = state.customTokens || [];
    const logos = await getAllTokenLogos();
    setTokenLogos(logos);
    setCustomTokens(customs);
    setStarredTokenAddresses(state.starredTokenAddresses || []);
    setVault(sessionVault);
    setUnlocked(true);
    // Show token rows before balances resolve
    seedTokenList(customs, logos);
    const w = await loadSigner(sessionVault, acc);
    syncDappAddress(w.address);
    syncWatchAccountsQuiet(sessionVault, accs);
    refresh(w.address, {
      silent: true,
      customTokens: customs,
      tokenLogos: logos,
      nftCollections: state.nftCollections || [],
      fiatCurrency: normalizeFiatCode(state.fiatCurrency),
    }).catch((err) => console.warn('Background refresh failed:', err?.message || err));
  }, [loadSigner, refresh, seedTokenList]);

  useEffect(() => {
    if (bootStartedRef.current) return undefined;
    bootStartedRef.current = true;

    (async () => {
      try {
        const [state, logos, session] = await Promise.all([
          getWalletState(),
          getAllTokenLogos(),
          getSession(),
        ]);

        const [incomingEnabled, alertsEnabled, alerts, demoBalanceOn] = await Promise.all([
          getIncomingNotifyEnabled(),
          getPriceAlertsEnabled(),
          getPriceAlerts(),
          // DEV_DEMO_BALANCE
          getDevDemoBalanceEnabled().catch(() => false),
        ]);
        setIncomingNotifications(incomingEnabled);
        setPriceAlertsEnabledState(alertsEnabled);
        setPriceAlertsState(alerts);
        setDevDemoBalanceState(Boolean(demoBalanceOn));

        setHasWallet(!!state?.vault);
        if (state) {
          setAccounts(state.accounts || defaultAccounts());
          setActiveAccountId(state.activeAccountId || '0');
          setCustomTokens(state.customTokens || []);
          setStarredTokenAddresses(state.starredTokenAddresses || []);
          setNftCollections(sanitizeNftCollections(state.nftCollections));
          setFiatCurrency(normalizeFiatCode(state.fiatCurrency));
          const savedTheme = normalizeTheme(state.theme || {});
          setThemeState(savedTheme);
          applyTheme(savedTheme);
        }
        setTokenLogos(logos);

        if (state?.vault && isSessionValid(session)) {
          await restoreUnlockedSession(state, session.vault);
        } else if (session && !isSessionValid(session)) {
          await clearSession();
        }
      } catch (err) {
        console.error('Wallet init failed:', err);
      } finally {
        setLoading(false);
      }
    })();
    return undefined;
    // Boot once on mount — restoreUnlockedSession is stable enough via refs/seeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chrome.storage?.onChanged) return undefined;

    const onNotifyPrefChange = (changes, area) => {
      if (area !== 'local' || !changes[INCOMING_NOTIFY_KEY] || incomingNotifyPersistingRef.current) {
        return;
      }
      const next = changes[INCOMING_NOTIFY_KEY].newValue;
      if (typeof next === 'boolean') {
        setIncomingNotifications(next);
      }
    };

    chrome.storage.onChanged.addListener(onNotifyPrefChange);
    return () => chrome.storage.onChanged.removeListener(onNotifyPrefChange);
  }, []);

  useEffect(() => {
    if (!chrome.storage?.onChanged) return undefined;

    const onPriceAlertPrefChange = (changes, area) => {
      if (area !== 'local' || priceAlertsPersistingRef.current) return;
      if (changes[PRICE_ALERTS_ENABLED_KEY]) {
        const next = changes[PRICE_ALERTS_ENABLED_KEY].newValue;
        if (typeof next === 'boolean') {
          setPriceAlertsEnabledState(next);
        }
      }
      if (changes[PRICE_ALERTS_KEY]) {
        const next = changes[PRICE_ALERTS_KEY].newValue;
        if (Array.isArray(next)) {
          setPriceAlertsState(next);
        }
      }
    };

    chrome.storage.onChanged.addListener(onPriceAlertPrefChange);
    return () => chrome.storage.onChanged.removeListener(onPriceAlertPrefChange);
  }, []);

  useEffect(() => {
    if (!chrome.storage?.onChanged) return undefined;

    const onStorageChange = (changes, area) => {
      if (area !== 'session' || !changes[SESSION_KEY]) return;
      if (!changes[SESSION_KEY].newValue) {
        setVault(null);
        setSigner(null);
        setAddress('');
        setUnlocked(false);
        setPlsBalance('0');
        setTokens([]);
        setNfts([]);
        syncDappAddress(null);
      }
    };

    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
  }, []);

  const setupWallet = async (decryptedVault, password, meta = {}) => {
    const encrypted = await encryptVault(decryptedVault, password);
    const accs = meta.accounts || defaultAccounts();
    await setWalletState({
      vault: encrypted,
      accounts: accs,
      activeAccountId: '0',
      customTokens: [],
      nftCollections: [],
      fiatCurrency: 'usd',
    });
    setHasWallet(true);
    setVault(decryptedVault);
    setAccounts(accs);
    setActiveAccountId('0');
    setCustomTokens([]);
    setStarredTokenAddresses([]);
    setUnlocked(true);
    enableSessionWrites();
    await saveSession(decryptedVault);
    seedTokenList([], {});
    const w = await loadSigner(decryptedVault, accs[0]);
    syncDappAddress(w.address);
    syncWatchAccountsQuiet(decryptedVault, accs);
    await refresh(w.address, { silent: true, customTokens: [], tokenLogos: {} });
  };

  const generateWalletMnemonic = async (wordCount = 12) => {
    const { createMnemonic } = await import('../lib/wallet');
    return createMnemonic(wordCount);
  };

  const completeWalletCreation = async (phrase, password) => {
    const { normalizeMnemonic, validatePhrase } = await import('../lib/wallet');
    const normalized = normalizeMnemonic(phrase);
    if (!validatePhrase(normalized)) throw new Error('error_invalid_recovery_phrase');
    await setupWallet({ type: 'mnemonic', secret: normalized }, password);
  };

  const importMnemonic = async (phrase, password) => {
    const { normalizeMnemonic, validatePhrase } = await import('../lib/wallet');
    const normalized = normalizeMnemonic(phrase);
    if (!validatePhrase(normalized)) throw new Error('error_invalid_recovery_phrase');
    await setupWallet({ type: 'mnemonic', secret: normalized }, password);
  };

  const importPrivateKey = async (privateKey, password) => {
    const { walletFromPrivateKey } = await import('../lib/wallet');
    const w = walletFromPrivateKey(privateKey);
    await setupWallet(
      { type: 'privateKey', secret: w.privateKey },
      password,
      { accounts: [{ id: '0', name: 'Imported', derivationIndex: 0 }] },
    );
  };

  /**
   * Unlock wallet. If authenticator 2FA is enabled, pass totpCode (6 digits)
   * or a recovery code after a valid password.
   */
  const unlock = async (password, totpCode = '') => {
    const state = await getWalletState();
    if (!state?.vault) throw new Error('error_no_wallet');

    let decrypted;
    try {
      decrypted = await decryptVault(state.vault, password);
    } catch {
      throw new Error('error_wrong_password');
    }

    const {
      getTotpState,
      decryptTotpPayload,
      verifyTotpCode,
      consumeRecoveryCode,
      saveTotpEnabled,
    } = await import('../lib/totp.js');

    const totpState = await getTotpState();
    if (totpState.enabled && totpState.encrypted) {
      let payload;
      try {
        payload = await decryptTotpPayload(totpState.encrypted, password);
      } catch {
        throw new Error('error_wrong_password');
      }

      const code = String(totpCode || '').trim();
      if (!code) {
        const err = new Error('error_totp_required');
        err.code = 'TOTP_REQUIRED';
        throw err;
      }

      const secretOk = payload?.secret && verifyTotpCode(payload.secret, code);
      if (!secretOk) {
        const nextHashes = await consumeRecoveryCode(totpState, code);
        if (!nextHashes) {
          throw new Error('error_totp_invalid');
        }
        await saveTotpEnabled({
          encrypted: totpState.encrypted,
          recoveryHashes: nextHashes,
        });
      }
      // Keep secret for optional transfer 2FA while unlocked
      if (payload?.secret) {
        await setSessionTotpSecret(payload.secret);
      }
    } else {
      await setSessionTotpSecret(null);
    }

    setVault(decrypted);
    setAccounts(state.accounts || defaultAccounts());
    setActiveAccountId(state.activeAccountId || '0');
    const customs = state.customTokens || [];
    setCustomTokens(customs);
    setStarredTokenAddresses(state.starredTokenAddresses || []);
    setNftCollections(sanitizeNftCollections(state.nftCollections));
    setFiatCurrency(normalizeFiatCode(state.fiatCurrency));
    const savedTheme = normalizeTheme(state.theme || {});
    setThemeState(savedTheme);
    applyTheme(savedTheme);
    const logos = await getAllTokenLogos();
    setTokenLogos(logos);
    setUnlocked(true);
    enableSessionWrites();
    await saveSession(decrypted);
    seedTokenList(customs, logos);
    const acc = (state.accounts || defaultAccounts()).find((a) => a.id === (state.activeAccountId || '0')) || state.accounts[0];
    const w = await loadSigner(decrypted, acc);
    // Await so pending dApp connect is auto-approved before unlock finishes
    await syncDappAddress(w.address);
    syncWatchAccountsQuiet(decrypted, state.accounts || defaultAccounts());
    await refresh(w.address, {
      silent: true,
      customTokens: customs,
      tokenLogos: logos,
      nftCollections: state.nftCollections || [],
      fiatCurrency: normalizeFiatCode(state.fiatCurrency),
    });
  };

  const getTotpEnabled = useCallback(async () => {
    const { isTotpEnabled } = await import('../lib/totp.js');
    return isTotpEnabled();
  }, []);

  /** Start 2FA setup — returns secret + QR for Google Authenticator. */
  const beginTotpSetup = useCallback(async (accountLabel = 'Wallet') => {
    const {
      generateTotpSecret,
      getTotpUri,
      getTotpQrDataUrl,
    } = await import('../lib/totp.js');
    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, accountLabel);
    const qrDataUrl = await getTotpQrDataUrl(secret, accountLabel);
    return { secret, uri, qrDataUrl };
  }, []);

  /** Confirm setup with password + first authenticator code. Returns recovery codes once. */
  const confirmTotpSetup = useCallback(async (password, secret, code) => {
    const state = await getWalletState();
    if (!state?.vault) throw new Error('error_no_wallet');
    try {
      await decryptVault(state.vault, password);
    } catch {
      throw new Error('error_wrong_password');
    }

    const {
      verifyTotpCode,
      generateRecoveryCodes,
      hashRecoveryCode,
      encryptTotpPayload,
      saveTotpEnabled,
    } = await import('../lib/totp.js');

    if (!verifyTotpCode(secret, code)) {
      throw new Error('error_totp_invalid');
    }

    const recoveryCodes = generateRecoveryCodes(8);
    const recoveryHashes = await Promise.all(recoveryCodes.map((c) => hashRecoveryCode(c)));
    const encrypted = await encryptTotpPayload({ secret, version: 1 }, password);
    await saveTotpEnabled({ encrypted, recoveryHashes });
    await setSessionTotpSecret(secret);
    return { recoveryCodes };
  }, []);

  const disableTotp = useCallback(async (password, code) => {
    const state = await getWalletState();
    if (!state?.vault) throw new Error('error_no_wallet');
    try {
      await decryptVault(state.vault, password);
    } catch {
      throw new Error('error_wrong_password');
    }

    const {
      getTotpState,
      decryptTotpPayload,
      verifyTotpCode,
      consumeRecoveryCode,
      clearTotpState,
    } = await import('../lib/totp.js');

    const totpState = await getTotpState();
    if (!totpState.enabled) return;

    const payload = await decryptTotpPayload(totpState.encrypted, password);
    const secretOk = payload?.secret && verifyTotpCode(payload.secret, code);
    if (!secretOk) {
      const nextHashes = await consumeRecoveryCode(totpState, code);
      if (!nextHashes) throw new Error('error_totp_invalid');
    }
    await clearTotpState();
    await setSessionTotpSecret(null);
    const { setTransfer2faEnabled } = await import('../lib/storage.js');
    await setTransfer2faEnabled(false);
  }, []);

  const lock = useCallback(async () => {
    disableSessionWrites();
    await clearSession();
    setVault(null);
    setSigner(null);
    setAddress('');
    setUnlocked(false);
    setPlsBalance('0');
    setTokens([]);
    setNfts([]);
    syncDappAddress(null);
    import('../lib/staking.js').then(({ clearStakeCaches }) => clearStakeCaches());
  }, []);

  /** Confirm transfer 2FA code (authenticator or recovery). Password only if session secret missing. */
  const verifyTransfer2fa = useCallback(async (code, password = '') => {
    const { verifyTransferTotpCode } = await import('../lib/totp.js');
    return verifyTransferTotpCode(code, password);
  }, []);

  useEffect(() => {
    if (!unlocked || !address) return;
    prefetchStakeQuiet(address);
  }, [unlocked, address]);

  const switchAccount = async (accountId) => {
    if (!vault) return;
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    setActiveAccountId(accountId);
    await persistMeta({ activeAccountId: accountId });
    const w = await loadSigner(vault, acc);
    syncDappAddress(w.address);
    syncWatchAccountsQuiet(vault, accounts);
    await refresh(w.address, { silent: true });
  };

  const addAccount = async () => {
    if (vault?.type !== 'mnemonic') throw new Error('error_hd_only');
    const nextIndex = Math.max(...accounts.map((a) => a.derivationIndex), -1) + 1;
    const id = String(nextIndex);
    const next = [...accounts, { id, name: `Account ${nextIndex + 1}`, derivationIndex: nextIndex }];
    setAccounts(next);
    await persistMeta({ accounts: next });
    syncWatchAccountsQuiet(vault, next);
    return id;
  };

  const renameAccount = async (accountId, name) => {
    const next = accounts.map((a) => (a.id === accountId ? { ...a, name } : a));
    setAccounts(next);
    await persistMeta({ accounts: next });
  };

  const exportPrivateKey = async (password) => {
    const state = await getWalletState();
    const decrypted = await decryptVault(state.vault, password);
    if (decrypted.type === 'mnemonic') {
      const { deriveAccountFromMnemonic } = await import('../lib/wallet');
      const w = await deriveAccountFromMnemonic(decrypted.secret, activeAccount.derivationIndex);
      return w.privateKey;
    }
    return decrypted.secret;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const state = await getWalletState();
    if (!state?.vault) throw new Error('error_no_wallet');

    let decrypted;
    try {
      decrypted = await decryptVault(state.vault, currentPassword);
    } catch {
      throw new Error('error_wrong_password');
    }

    const encrypted = await encryptVault(decrypted, newPassword);
    await persistMeta({}, encrypted);

    try {
      const { reencryptTotpForNewPassword } = await import('../lib/totp.js');
      await reencryptTotpForNewPassword(currentPassword, newPassword);
    } catch {
      /* TOTP may be off or re-encrypt failed — wallet password still changed */
    }

    if (unlocked) {
      setVault(decrypted);
      enableSessionWrites();
      await saveSession(decrypted);
    }
  };

  const addCustomToken = async (token) => {
    const { logoData, ...meta } = token;
    const addr = meta.address.trim();
    if (!addr) throw new Error('error_token_address');

    const official = getEcosystemToken(addr);
    // Always load decimals/symbol/name from chain — never trust caller metadata
    // (wrong decimals break balances, send amounts, and swap quotes).
    const { fetchErc20TokenMeta } = await import('../lib/token-decimals.js');
    const onChain = await fetchErc20TokenMeta(addr, address);
    const entry = {
      ...meta,
      address: addr,
      isCustom: true,
      symbol: onChain.symbol,
      name: onChain.name,
      decimals: onChain.decimals,
    };

    let logos = { ...tokenLogos };
    if (official) {
      entry.logo = official.logo;
      if (logos[addr.toLowerCase()]) {
        const { removeTokenLogo } = await import('../lib/token-logos');
        logos = await removeTokenLogo(addr);
        setTokenLogos(logos);
      }
    } else if (logoData) {
      logos = await saveTokenLogo(entry.address, logoData);
      setTokenLogos(logos);
    }

    const next = [
      ...customTokens.filter((t) => t.address.toLowerCase() !== entry.address.toLowerCase()),
      entry,
    ];
    setCustomTokens(next);
    await persistMeta({ customTokens: next });
    await refresh(address, { customTokens: next, tokenLogos: logos });
    return entry;
  };

  const removeCustomToken = async (tokenAddress) => {
    const addr = (tokenAddress || '').trim().toLowerCase();
    if (!addr) throw new Error('error_remove_token');

    const next = customTokens.filter((t) => t.address.toLowerCase() !== addr);
    if (next.length === customTokens.length) throw new Error('error_remove_token');

    let logos = { ...tokenLogos };
    if (logos[addr]) {
      const { removeTokenLogo } = await import('../lib/token-logos');
      logos = await removeTokenLogo(tokenAddress);
      setTokenLogos(logos);
    }

    setCustomTokens(next);
    await persistMeta({ customTokens: next });
    await refresh(address, { customTokens: next, tokenLogos: logos });
  };

  const toggleStarredToken = useCallback((tokenAddress) => {
    // Sync state update first so View Transitions / list reorder feel instant.
    const next = toggleStarredAddress(starredTokenAddresses, tokenAddress);
    setStarredTokenAddresses(next);
    persistMeta({ starredTokenAddresses: next }).catch((err) => {
      console.warn('Failed to persist starred tokens:', err?.message || err);
    });
  }, [persistMeta, starredTokenAddresses]);

  const addNftCollection = async (collection) => {
    const addr = (collection.address || '').trim();
    if (!addr) throw new Error('error_nft_address');
    if (!isValidAddress(addr)) throw new Error('invalid_address');

    const { assertNftContract } = await import('../lib/nft');
    const standard = await assertNftContract(addr, address);

    const entry = { ...collection, address: addr, standard };
    const next = [
      ...sanitizeNftCollections(nftCollections)
        .filter((c) => c.address.toLowerCase() !== entry.address.toLowerCase()),
      entry,
    ];
    setNftCollections(next);
    await persistMeta({ nftCollections: next });
    await refresh();
  };

  const changeFiat = async (currency) => {
    const next = normalizeFiatCode(currency);
    setFiatCurrency(next);
    await persistMeta({ fiatCurrency: next });
    await refresh(undefined, { fiatCurrency: next });
  };

  const resetWallet = async () => {
    await clearWalletState();
    try {
      const { clearTotpState } = await import('../lib/totp.js');
      await clearTotpState();
    } catch { /* ignore */ }
    sendRuntimeMessage({ type: 'NOTIFY_WALLET_RESET' });
    setHasWallet(false);
    lock();
    setAccounts(defaultAccounts());
    setCustomTokens([]);
    setStarredTokenAddresses([]);
    setNftCollections([]);
    setThemeState(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
  };

  const setTheme = async (next) => {
    const normalized = normalizeTheme(next);
    setThemeState(normalized);
    applyTheme(normalized);
    await persistMeta({ theme: normalized });
  };

  const setPriceAlertsEnabledHandler = useCallback(async (enabled) => {
    priceAlertsPersistingRef.current = true;
    setPriceAlertsEnabledState(enabled);
    try {
      await setPriceAlertsEnabled(enabled);
      const persisted = await getPriceAlertsEnabled();
      setPriceAlertsEnabledState(persisted);
      sendRuntimeMessage({ type: 'PRICE_ALERT_SET_ENABLED', enabled: persisted });
    } catch (err) {
      const persisted = await getPriceAlertsEnabled();
      setPriceAlertsEnabledState(persisted);
      throw err;
    } finally {
      priceAlertsPersistingRef.current = false;
    }
  }, []);

  const addPriceAlert = useCallback(async ({
    symbol, target, direction, currency,
  }) => {
    const normalized = normalizePriceAlert({
      id: createPriceAlertId(),
      symbol,
      target,
      direction,
      currency: currency || fiatCurrency,
      createdAt: Date.now(),
    });
    if (!normalized) {
      throw new Error('price_alert_invalid_target');
    }

    const current = await getPriceAlerts();
    if (current.some((alert) => alert.symbol === normalized.symbol)) {
      throw new Error('price_alert_duplicate');
    }
    if (current.length >= 10) {
      throw new Error('price_alert_limit');
    }

    const next = [...current, normalized];
    priceAlertsPersistingRef.current = true;
    setPriceAlertsState(next);
    try {
      await setPriceAlerts(next);
      sendRuntimeMessage({ type: 'PRICE_ALERT_POLL_NOW' });
    } finally {
      priceAlertsPersistingRef.current = false;
    }
    return normalized;
  }, [fiatCurrency]);

  const removePriceAlert = useCallback(async (id) => {
    const current = await getPriceAlerts();
    const next = current.filter((alert) => alert.id !== id);
    priceAlertsPersistingRef.current = true;
    setPriceAlertsState(next);
    try {
      await setPriceAlerts(next);
      sendRuntimeMessage({ type: 'PRICE_ALERT_POLL_NOW' });
    } finally {
      priceAlertsPersistingRef.current = false;
    }
  }, []);

  const setIncomingNotificationsEnabled = useCallback(async (enabled) => {
    incomingNotifyPersistingRef.current = true;
    setIncomingNotifications(enabled);
    try {
      await persistIncomingNotifications(
        enabled,
        unlocked && vault ? vault : null,
        accounts,
      );
      const persisted = await getIncomingNotifyEnabled();
      setIncomingNotifications(persisted);
      sendRuntimeMessage({ type: 'NOTIFY_SET_ENABLED', enabled: persisted });
    } catch (err) {
      const persisted = await getIncomingNotifyEnabled();
      setIncomingNotifications(persisted);
      throw err;
    } finally {
      incomingNotifyPersistingRef.current = false;
    }
  }, [accounts, unlocked, vault]);

  const realPortfolioValue = portfolioFiatValue({ pls: plsBalance, tokens }, prices);

  // DEV_DEMO_BALANCE — display-only +$300 (remove with src/lib/dev-demo-balance.js)
  const setDevDemoBalance = useCallback(async (enabled) => {
    const next = Boolean(enabled);
    setDevDemoBalanceState(next);
    try {
      await persistDevDemoBalanceEnabled(next);
    } catch {
      setDevDemoBalanceState(!next);
      throw new Error('Could not save dev mode');
    }
  }, []);

  const displayBalances = useMemo(
    () => applyDevDemoDisplay({
      enabled: devDemoBalance,
      portfolioValue: realPortfolioValue,
      plsBalance,
      tokens,
      prices,
    }),
    [devDemoBalance, realPortfolioValue, plsBalance, tokens, prices],
  );

  return (
    <WalletContext.Provider
      value={{
        loading,
        unlocked,
        hasWallet,
        vault,
        signer,
        address,
        accounts,
        activeAccount,
        activeAccountId,
        plsBalance: displayBalances.plsBalance,
        tokens: displayBalances.tokens,
        nfts,
        prices,
        portfolioValue: displayBalances.portfolioValue,
        // DEV_DEMO_BALANCE
        devDemoBalance,
        setDevDemoBalance,
        fiatCurrency,
        customTokens,
        starredTokenAddresses,
        toggleStarredToken,
        theme,
        setTheme,
        refreshing,
        generateWalletMnemonic,
        completeWalletCreation,
        importMnemonic,
        importPrivateKey,
        unlock,
        getTotpEnabled,
        beginTotpSetup,
        confirmTotpSetup,
        disableTotp,
        verifyTransfer2fa,
        lock,
        switchAccount,
        addAccount,
        renameAccount,
        exportPrivateKey,
        changePassword,
        addCustomToken,
        removeCustomToken,
        addNftCollection,
        changeFiat,
        resetWallet,
        incomingNotifications,
        setIncomingNotificationsEnabled,
        priceAlertsEnabled,
        setPriceAlertsEnabled: setPriceAlertsEnabledHandler,
        priceAlerts,
        addPriceAlert,
        removePriceAlert,
        defaultAlertDirection,
        refresh,
        checkHasWallet: async () => {
          const state = await getWalletState();
          const exists = !!state?.vault;
          setHasWallet(exists);
          return exists;
        },
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}