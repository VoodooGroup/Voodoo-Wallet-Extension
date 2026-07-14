import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { getEcosystemToken } from '../config/ecosystem-tokens';
import { defaultAccounts } from '../lib/accounts';
import { encryptVault, decryptVault } from '../lib/vault';
import { getWalletState, setWalletState, clearWalletState } from '../lib/storage';
import { normalizeFiatCode, portfolioFiatValue } from '../lib/fiat';
import { DEFAULT_THEME, applyTheme } from '../lib/theme';
import { getAllTokenLogos, saveTokenLogo } from '../lib/token-logos';
import {
  SESSION_KEY,
  clearSession,
  disableSessionWrites,
  enableSessionWrites,
  getSession,
  isSessionValid,
  saveSession,
} from '../lib/session';

const WalletContext = createContext(null);

function syncDappAddress(addr) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: 'WALLET_SET_ACTIVE', address: addr || null });
  }
}

export function WalletProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [vault, setVault] = useState(null);
  const [accounts, setAccounts] = useState(defaultAccounts());
  const [activeAccountId, setActiveAccountId] = useState('0');
  const [customTokens, setCustomTokens] = useState([]);
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

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) || accounts[0],
    [accounts, activeAccountId],
  );

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
    const silent = overrides.silent ?? false;

    if (!silent) setRefreshing(true);
    try {
      const [{ fetchAllBalances }, { fetchFiatPrices }, { fetchAllNfts }] = await Promise.all([
        import('../lib/chain'),
        import('../lib/prices'),
        import('../lib/nft'),
      ]);
      const [balances, fiat, nftList] = await Promise.all([
        fetchAllBalances(addr, tokensMeta, logos),
        fetchFiatPrices(currency),
        fetchAllNfts(addr, collections),
      ]);
      setPlsBalance(balances.pls);
      setTokens(balances.tokens);
      setPrices(fiat);
      setNfts(nftList);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [address, customTokens, fiatCurrency, nftCollections, tokenLogos]);

  const restoreUnlockedSession = useCallback(async (state, sessionVault) => {
    const accs = state.accounts || defaultAccounts();
    const acc = accs.find((a) => a.id === (state.activeAccountId || '0')) || accs[0];
    setVault(sessionVault);
    setUnlocked(true);
    const w = await loadSigner(sessionVault, acc);
    syncDappAddress(w.address);
    refresh(w.address, {
      silent: true,
      customTokens: state.customTokens || [],
      nftCollections: state.nftCollections || [],
      fiatCurrency: normalizeFiatCode(state.fiatCurrency),
    }).catch((err) => console.error('Background refresh failed:', err));
  }, [loadSigner, refresh]);

  useEffect(() => {
    (async () => {
      try {
        const [state, logos, session] = await Promise.all([
          getWalletState(),
          getAllTokenLogos(),
          getSession(),
        ]);

        setHasWallet(!!state?.vault);
        if (state) {
          setAccounts(state.accounts || defaultAccounts());
          setActiveAccountId(state.activeAccountId || '0');
          setCustomTokens(state.customTokens || []);
          setNftCollections(state.nftCollections || []);
          setFiatCurrency(normalizeFiatCode(state.fiatCurrency));
          const savedTheme = { ...DEFAULT_THEME, ...(state.theme || {}) };
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
  }, [restoreUnlockedSession]);

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
    setUnlocked(true);
    enableSessionWrites();
    await saveSession(decryptedVault);
    const w = await loadSigner(decryptedVault, accs[0]);
    syncDappAddress(w.address);
    await refresh(w.address, { silent: true });
  };

  const createWallet = async (password, wordCount = 12) => {
    const { createMnemonic } = await import('../lib/wallet');
    const phrase = createMnemonic(wordCount);
    await setupWallet({ type: 'mnemonic', secret: phrase }, password);
    return phrase;
  };

  const importMnemonic = async (phrase, password) => {
    const { normalizeMnemonic, validatePhrase } = await import('../lib/wallet');
    const normalized = normalizeMnemonic(phrase);
    if (!validatePhrase(normalized)) throw new Error('Invalid recovery phrase');
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

  const unlock = async (password) => {
    const state = await getWalletState();
    if (!state?.vault) throw new Error('No wallet found');
    const decrypted = await decryptVault(state.vault, password);
    setVault(decrypted);
    setAccounts(state.accounts || defaultAccounts());
    setActiveAccountId(state.activeAccountId || '0');
    setCustomTokens(state.customTokens || []);
    setNftCollections(state.nftCollections || []);
    setFiatCurrency(normalizeFiatCode(state.fiatCurrency));
    const savedTheme = { ...DEFAULT_THEME, ...(state.theme || {}) };
    setThemeState(savedTheme);
    applyTheme(savedTheme);
    const logos = await getAllTokenLogos();
    setTokenLogos(logos);
    setUnlocked(true);
    enableSessionWrites();
    await saveSession(decrypted);
    const acc = (state.accounts || defaultAccounts()).find((a) => a.id === (state.activeAccountId || '0')) || state.accounts[0];
    const w = await loadSigner(decrypted, acc);
    syncDappAddress(w.address);
    await refresh(w.address, { silent: true });
  };

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
  }, []);

  const switchAccount = async (accountId) => {
    if (!vault) return;
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    setActiveAccountId(accountId);
    await persistMeta({ activeAccountId: accountId });
    const w = await loadSigner(vault, acc);
    syncDappAddress(w.address);
    await refresh(w.address, { silent: true });
  };

  const addAccount = async () => {
    if (vault?.type !== 'mnemonic') throw new Error('Only HD wallets support multiple accounts');
    const nextIndex = Math.max(...accounts.map((a) => a.derivationIndex), -1) + 1;
    const id = String(nextIndex);
    const next = [...accounts, { id, name: `Account ${nextIndex + 1}`, derivationIndex: nextIndex }];
    setAccounts(next);
    await persistMeta({ accounts: next });
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
    if (!state?.vault) throw new Error('No wallet found');

    let decrypted;
    try {
      decrypted = await decryptVault(state.vault, currentPassword);
    } catch {
      throw new Error('Wrong password');
    }

    const encrypted = await encryptVault(decrypted, newPassword);
    await persistMeta({}, encrypted);

    if (unlocked) {
      setVault(decrypted);
      enableSessionWrites();
      await saveSession(decrypted);
    }
  };

  const addCustomToken = async (token) => {
    const { logoData, ...meta } = token;
    const addr = meta.address.trim();
    if (!addr) throw new Error('Enter a token contract address');

    const official = getEcosystemToken(addr);
    let entry = { ...meta, address: addr, isCustom: true };
    if (!entry.symbol || entry.decimals == null) {
      const { getTokenBalance } = await import('../lib/chain');
      const onChain = await getTokenBalance(addr, address);
      entry = {
        ...entry,
        symbol: onChain.symbol,
        name: onChain.name,
        decimals: onChain.decimals,
      };
    }

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

  const addNftCollection = async (collection) => {
    const next = [...nftCollections.filter((c) => c.address.toLowerCase() !== collection.address.toLowerCase()), collection];
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
    setHasWallet(false);
    lock();
    setAccounts(defaultAccounts());
    setCustomTokens([]);
    setNftCollections([]);
    setThemeState(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
  };

  const setTheme = async (next) => {
    setThemeState(next);
    applyTheme(next);
    await persistMeta({ theme: next });
  };

  const portfolioValue = portfolioFiatValue({ pls: plsBalance, tokens }, prices);

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
        plsBalance,
        tokens,
        nfts,
        prices,
        portfolioValue,
        fiatCurrency,
        customTokens,
        theme,
        setTheme,
        refreshing,
        createWallet,
        importMnemonic,
        importPrivateKey,
        unlock,
        lock,
        switchAccount,
        addAccount,
        renameAccount,
        exportPrivateKey,
        changePassword,
        addCustomToken,
        addNftCollection,
        changeFiat,
        resetWallet,
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