import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { DEFAULT_TOKENS } from '../../config/pulsechain';
import { getEcosystemToken } from '../../config/ecosystem-tokens';
import { shortenAddress } from '../../lib/wallet';
import { formatTokenPrice } from '../../lib/prices';
import { formatFiatAmount } from '../../lib/fiat';
import TokenIcon from '../../components/TokenIcon';
import TokenStarButton from '../../components/TokenStarButton';
import { isTokenStarred, sortTokensForDisplay } from '../../lib/token-sort';
import TokenChartPanel from '../../components/TokenChartPanel';
import PortfolioHistoryChart from '../../components/PortfolioHistoryChart';
import VdoRankCard from '../../components/VdoRankCard';
import { compressImageFile } from '../../lib/image-utils';
import { logoutIconUrl } from '../../lib/assets';
import { getRichlistHomeEnabled, RICHLIST_HOME_KEY } from '../../lib/storage';

export default function Home() {
  const { t } = useI18n();
  const {
    address, activeAccount, plsBalance, tokens, nfts, portfolioValue, prices,
    fiatCurrency, addCustomToken, removeCustomToken, addNftCollection, lock,
    starredTokenAddresses, toggleStarredToken,
  } = useWallet();

  const vdoToken = tokens.find((tok) => tok.symbol === 'VDO');
  const vdoBalance = vdoToken ? Number(vdoToken.balance) : 0;

  const [tokenAddr, setTokenAddr] = useState('');
  const [tokenLogoData, setTokenLogoData] = useState('');
  const [nftAddr, setNftAddr] = useState('');
  const [tokenMsg, setTokenMsg] = useState('');
  const [tokenMsgError, setTokenMsgError] = useState(false);
  const [nftMsg, setNftMsg] = useState('');
  const [nftMsgError, setNftMsgError] = useState(false);
  const [addingToken, setAddingToken] = useState(false);
  const [removingTokenAddr, setRemovingTokenAddr] = useState('');
  const [copied, setCopied] = useState(false);
  const [richlistEnabled, setRichlistEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRichlistHomeEnabled()
      .then((on) => { if (!cancelled) setRichlistEnabled(on); })
      .catch(() => { if (!cancelled) setRichlistEnabled(true); });
    const onStorage = (changes, area) => {
      if (area !== 'local' || !changes[RICHLIST_HOME_KEY]) return;
      const next = changes[RICHLIST_HOME_KEY].newValue;
      if (typeof next === 'boolean') setRichlistEnabled(next);
    };
    try {
      chrome.storage?.onChanged?.addListener(onStorage);
    } catch { /* ignore */ }
    return () => {
      cancelled = true;
      try {
        chrome.storage?.onChanged?.removeListener(onStorage);
      } catch { /* ignore */ }
    };
  }, []);

  const coreTokenAddresses = useMemo(
    () => new Set(DEFAULT_TOKENS.map((tok) => tok.address.toLowerCase())),
    [],
  );

  const canRemoveToken = (tok) => (
    tok.isCustom && !coreTokenAddresses.has(tok.address?.toLowerCase())
  );

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setTokenMsg(t('error_copy_clipboard'));
      setTokenMsgError(true);
    }
  };

  const displayTokens = useMemo(
    () => sortTokensForDisplay(tokens, starredTokenAddresses),
    [tokens, starredTokenAddresses],
  );

  const officialToken = useMemo(
    () => getEcosystemToken(tokenAddr.trim()),
    [tokenAddr],
  );

  useEffect(() => {
    if (officialToken) setTokenLogoData('');
  }, [officialToken]);

  const onLogoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTokenMsg('');
    setTokenMsgError(false);
    try {
      const compressed = await compressImageFile(file);
      setTokenLogoData(compressed);
    } catch (err) {
      setTokenLogoData('');
      setTokenMsg(err.message || t('error_upload_logo'));
      setTokenMsgError(true);
    }
    e.target.value = '';
  };

  const removeToken = async (tok) => {
    setTokenMsg('');
    setTokenMsgError(false);
    setRemovingTokenAddr(tok.address);
    try {
      await removeCustomToken(tok.address);
      setTokenMsg(t('token_removed', { symbol: tok.symbol }));
      setTokenMsgError(false);
    } catch (e) {
      const key = e.message || '';
      setTokenMsg(t(key) !== key ? t(key) : t('error_remove_token'));
      setTokenMsgError(true);
    } finally {
      setRemovingTokenAddr('');
    }
  };

  const addToken = async () => {
    if (!tokenAddr.trim()) {
      setTokenMsg(t('error_token_address'));
      setTokenMsgError(true);
      return;
    }
    setTokenMsg('');
    setTokenMsgError(false);
    setAddingToken(true);
    try {
      const added = await addCustomToken({
        address: tokenAddr.trim(),
        logoData: tokenLogoData || undefined,
      });
      setTokenAddr('');
      setTokenLogoData('');
      setTokenMsg(t('token_added', { symbol: added.symbol }));
      setTokenMsgError(false);
    } catch (e) {
      setTokenMsg(e.message || t('error_add_token'));
      setTokenMsgError(true);
    } finally {
      setAddingToken(false);
    }
  };

  const onNftAddrChange = (value) => {
    setNftAddr(value);
    if (!value.trim()) {
      setNftMsg('');
      setNftMsgError(false);
      return;
    }
    if (nftMsg && !nftMsgError) {
      setNftMsg('');
      setNftMsgError(false);
    }
  };

  const addNft = async () => {
    const addr = nftAddr.trim();
    if (!addr) {
      setNftMsg(t('error_nft_address'));
      setNftMsgError(true);
      return;
    }
    setNftMsg('');
    setNftMsgError(false);
    try {
      await addNftCollection({
        address: addr,
        name: t('nft_collection_default'),
      });
      setNftMsg(t('nft_collection_added'));
      setNftMsgError(false);
    } catch (e) {
      const key = e.message || '';
      setNftMsg(t(key) !== key ? t(key) : t('error_add_nft_collection'));
      setNftMsgError(true);
    }
  };

  const showNftFeedback = nftMsg && (nftMsgError || !!nftAddr.trim());

  const busy = addingToken || !!removingTokenAddr;

  return (
    <div className="home-wrap">
      <div>
        <div className="card home-hero">
          <div className="home-hero-top">
            <div className="home-account-chip">
              <span className="home-account-name">{activeAccount?.name}</span>
              <div className="home-account-address">
                <span>{shortenAddress(address, 6)}</span>
                <button
                  type="button"
                  className="copy-address-btn"
                  onClick={copyAddress}
                  title={copied ? t('copied') : t('copy_address')}
                  aria-label={t('copy_wallet_address')}
                >
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="home-hero-actions">
              <button
                type="button"
                className="home-lock-btn"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  lock();
                }}
                title={t('lock')}
                aria-label={t('lock')}
              >
                <img
                  src={logoutIconUrl()}
                  alt=""
                  className="home-lock-icon"
                  width={18}
                  height={18}
                  draggable={false}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <div className="home-balance-hero">
            <div className="home-balance-label">
              {t('portfolio', { currency: fiatCurrency.toUpperCase() })}
            </div>
            <div
              className="home-balance-amount"
              aria-live="polite"
            >
              {formatFiatAmount(portfolioValue, fiatCurrency, 2)}
            </div>
          </div>
        </div>

        {richlistEnabled && address && (
          <VdoRankCard address={address} vdoBalance={vdoBalance} />
        )}

        <PortfolioHistoryChart
          address={address}
          currentValue={portfolioValue}
          fiatCurrency={fiatCurrency}
        />

        <TokenChartPanel
          prices={prices}
          fiatCurrency={fiatCurrency}
          vdoBalance={vdoBalance}
        />

        <div className="card">
          <div className="token-item" style={{ margin: 0, background: 'transparent', border: 'none', padding: 0 }}>
            <div className="token-meta">
              <TokenIcon symbol="PLS" />
              <div>
                <div className="token-symbol">{t('pulse_pls')}</div>
              </div>
            </div>
            <span className="token-balance">{Number(plsBalance).toFixed(4)}</span>
          </div>
        </div>

        <div className="card">
          <div className="label">{t('tokens')}</div>
          <div className="token-list">
            {displayTokens.map((tok) => {
              const tokenPrice = prices[tok.symbol] || 0;
              const fiatValue = Number(tok.balance) * tokenPrice;
              const starred = isTokenStarred(starredTokenAddresses, tok.address);
              return (
                <div
                  key={tok.address}
                  className={`token-item${starred ? ' token-item-starred' : ''}`}
                >
                  <div className="token-meta">
                    <TokenStarButton
                      starred={starred}
                      onClick={() => toggleStarredToken(tok.address)}
                      ariaLabel={starred
                        ? t('unstar_token', { symbol: tok.symbol })
                        : t('star_token', { symbol: tok.symbol })}
                    />
                    <TokenIcon symbol={tok.symbol} logo={tok.logo} logoData={tok.logoData} />
                    <div>
                      <div className="token-symbol">
                        {tok.symbol}
                        {tok.isCustom && <span className="muted" style={{ marginLeft: 4, fontSize: 10 }}>{t('custom')}</span>}
                      </div>
                      {tokenPrice > 0 && (
                        <div className="token-fiat">{formatTokenPrice(tokenPrice, fiatCurrency)}</div>
                      )}
                    </div>
                  </div>
                  <div className="token-item-side">
                    <div className="token-item-balances">
                      <div className="token-balance">{Number(tok.balance || 0).toFixed(4)}</div>
                      {tokenPrice > 0 && (
                        <div className="token-fiat">{formatFiatAmount(fiatValue, fiatCurrency)}</div>
                      )}
                    </div>
                    {canRemoveToken(tok) && (
                      <button
                        type="button"
                        className="token-remove-btn"
                        disabled={busy}
                        aria-label={t('remove_custom_token', { symbol: tok.symbol })}
                        onClick={() => removeToken(tok)}
                      >
                        {removingTokenAddr === tok.address ? t('updating') : t('remove_token')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {nfts.length > 0 && (
          <div className="card">
            <div className="label">{t('nfts')}</div>
            {nfts.map((n) => (
              <div key={`${n.contractAddress}-${n.tokenId}`} className="token-item">
                <div className="token-meta">
                  <div>
                    <div className="token-symbol">
                      {n.symbol || n.name || 'NFT'}
                      {' '}
                      #
                      {n.tokenId}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {(n.standard === 'erc1155' ? 'ERC-1155' : 'ERC-721')}
                      {n.standard === 'erc1155' && n.balance && Number(n.balance) > 1
                        ? ` · ×${n.balance}`
                        : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="label">{t('add_custom_token')}</div>
          <input
            value={tokenAddr}
            onChange={(e) => {
              const next = e.target.value;
              setTokenAddr(next);
              // Hide / reset logo UI when address is cleared
              if (!next.trim()) {
                setTokenLogoData('');
              }
            }}
            placeholder={t('placeholder_address')}
            disabled={busy}
          />
          {/* Logo picker only after the user starts filling an address */}
          {tokenAddr.trim() ? (
            officialToken ? (
              <>
                <div className="label">{t('token_logo')}</div>
                <div className="token-meta official-token-logo-preview">
                  <TokenIcon symbol={officialToken.symbol} logo={officialToken.logo} />
                  <span className="token-symbol">{officialToken.symbol}</span>
                </div>
              </>
            ) : (
              <>
                <label className="label">{t('token_logo_optional')}</label>
                <input type="file" accept="image/*" onChange={onLogoPick} disabled={busy} />
                {tokenLogoData && (
                  <div className="token-meta" style={{ marginTop: 6 }}>
                    <img src={tokenLogoData} alt="" className="token-icon" />
                    <span className="muted">{t('logo_preview')}</span>
                  </div>
                )}
                <p className="muted" style={{ fontSize: 11 }}>{t('token_logo_hint')}</p>
              </>
            )
          ) : null}
          <button type="button" className="btn btn-secondary" disabled={busy || !tokenAddr.trim()} onClick={addToken}>
            {addingToken ? t('adding') : t('add_token')}
          </button>
          {tokenMsg && <p className={tokenMsgError ? 'error' : 'success'}>{tokenMsg}</p>}
          <div className="label" style={{ marginTop: 8 }}>{t('add_nft_collection')}</div>
          <input
            value={nftAddr}
            onChange={(e) => onNftAddrChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (nftAddr.trim()) addNft();
              }
            }}
            placeholder={t('nft_placeholder')}
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !nftAddr.trim()}
            onClick={(e) => {
              e.preventDefault();
              addNft();
            }}
          >
            {t('track_nfts')}
          </button>
          {showNftFeedback && <p className={nftMsgError ? 'error' : 'success'}>{nftMsg}</p>}
        </div>
      </div>
    </div>
  );
}