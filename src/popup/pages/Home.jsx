import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { getEcosystemToken } from '../../config/ecosystem-tokens';
import { shortenAddress } from '../../lib/wallet';
import { formatTokenPrice } from '../../lib/prices';
import { formatFiatAmount } from '../../lib/fiat';
import TokenIcon from '../../components/TokenIcon';
import RefreshLoader from '../../components/RefreshLoader';
import { compressImageFile } from '../../lib/image-utils';

export default function Home() {
  const {
    address, activeAccount, plsBalance, tokens, nfts, portfolioValue, prices,
    fiatCurrency, refreshing, refresh, addCustomToken, addNftCollection, lock,
  } = useWallet();

  const vdoPrice = prices.VDO || 0;
  const vdoChange = prices.VDO_CHANGE_24H ?? 0;
  const vdoToken = tokens.find((t) => t.symbol === 'VDO');
  const vdoBalance = vdoToken ? Number(vdoToken.balance) : 0;

  const [tokenAddr, setTokenAddr] = useState('');
  const [tokenLogoData, setTokenLogoData] = useState('');
  const [nftAddr, setNftAddr] = useState('');
  const [msg, setMsg] = useState('');
  const [msgError, setMsgError] = useState(false);
  const [addingToken, setAddingToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg('Could not copy to clipboard');
      setMsgError(true);
    }
  };

  const displayTokens = useMemo(
    () => [...tokens].sort((a, b) => Number(b.isCustom) - Number(a.isCustom)),
    [tokens],
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
    setMsg('');
    setMsgError(false);
    try {
      const compressed = await compressImageFile(file);
      setTokenLogoData(compressed);
    } catch (err) {
      setTokenLogoData('');
      setMsg(err.message || 'Could not upload logo');
      setMsgError(true);
    }
    e.target.value = '';
  };

  const addToken = async () => {
    if (!tokenAddr.trim()) {
      setMsg('Enter a token contract address');
      setMsgError(true);
      return;
    }
    setMsg('');
    setMsgError(false);
    setAddingToken(true);
    try {
      const added = await addCustomToken({
        address: tokenAddr.trim(),
        logoData: tokenLogoData || undefined,
      });
      setTokenAddr('');
      setTokenLogoData('');
      setMsg(`${added.symbol} added to your token list`);
      setMsgError(false);
    } catch (e) {
      setMsg(e.message || 'Could not add token');
      setMsgError(true);
    } finally {
      setAddingToken(false);
    }
  };

  const addNft = async () => {
    try {
      await addNftCollection({ address: nftAddr, name: 'Collection' });
      setNftAddr('');
      setMsg('NFT collection added');
      setMsgError(false);
    } catch (e) {
      setMsg(e.message);
      setMsgError(true);
    }
  };

  const busy = refreshing || addingToken;

  return (
    <div className="home-wrap">
      {busy && <RefreshLoader />}

      <div className={busy ? 'home-refreshing' : ''}>
        <div className="card">
          <div className="row">
            <div>
              <div className="label">{activeAccount?.name}</div>
              <div className="wallet-address-row">
                <div className="value">{shortenAddress(address, 6)}</div>
                <button
                  type="button"
                  className="copy-address-btn"
                  onClick={copyAddress}
                  title={copied ? 'Copied!' : 'Copy address'}
                  aria-label="Copy wallet address"
                >
                  {copied ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => refresh()}>
              Refresh
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="label">Portfolio ({fiatCurrency.toUpperCase()})</div>
            <div className="value">{portfolioValue.toFixed(2)}</div>
          </div>
          <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: 'auto' }}
              onClick={(e) => {
                e.stopPropagation();
                lock();
              }}
            >
              Lock
            </button>
          </div>
        </div>

        <div className="card vdo-price-card">
          <div className="row">
            <div className="token-meta">
              <TokenIcon symbol="VDO" />
              <div>
                <div className="label">VDO live price</div>
                <div className="value">{formatTokenPrice(vdoPrice, fiatCurrency)}</div>
              </div>
            </div>
            <span className={vdoChange >= 0 ? 'price-up' : 'price-down'}>
              {vdoChange >= 0 ? '+' : ''}{vdoChange.toFixed(2)}% 24h
            </span>
          </div>
          {vdoBalance > 0 && (
            <div className="vdo-holdings">
              Holdings: {vdoBalance.toFixed(4)} VDO · {formatFiatAmount(vdoBalance * vdoPrice, fiatCurrency)}
            </div>
          )}
        </div>

        <div className="card">
          <div className="token-item" style={{ margin: 0, background: 'transparent', border: 'none', padding: 0 }}>
            <div className="token-meta">
              <TokenIcon symbol="PLS" />
              <div>
                <div className="token-symbol">Pulse (PLS)</div>
              </div>
            </div>
            <span className="token-balance">{Number(plsBalance).toFixed(4)}</span>
          </div>
        </div>

        <div className="card">
          <div className="label">Tokens</div>
          <div className="token-list">
            {displayTokens.map((t) => {
              const tokenPrice = prices[t.symbol] || 0;
              const fiatValue = Number(t.balance) * tokenPrice;
              return (
                <div key={t.address} className="token-item">
                  <div className="token-meta">
                    <TokenIcon symbol={t.symbol} logo={t.logo} logoData={t.logoData} />
                    <div>
                      <div className="token-symbol">
                        {t.symbol}
                        {t.isCustom && <span className="muted" style={{ marginLeft: 4, fontSize: 10 }}>custom</span>}
                      </div>
                      {tokenPrice > 0 && (
                        <div className="token-fiat">{formatTokenPrice(tokenPrice, fiatCurrency)}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="token-balance">{Number(t.balance).toFixed(4)}</div>
                    {tokenPrice > 0 && (
                      <div className="token-fiat">{formatFiatAmount(fiatValue, fiatCurrency)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {nfts.length > 0 && (
          <div className="card">
            <div className="label">NFTs</div>
            {nfts.map((n) => (
              <div key={`${n.contractAddress}-${n.tokenId}`} className="token-item">
                <span>{n.symbol} #{n.tokenId}</span>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="label">Add custom token (address)</div>
          <input value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value)} placeholder="0x…" disabled={busy} />
          {officialToken ? (
            <>
              <div className="label">Token logo</div>
              <div className="token-meta official-token-logo-preview">
                <TokenIcon symbol={officialToken.symbol} logo={officialToken.logo} />
                <span className="muted">Official {officialToken.symbol} logo (auto-applied)</span>
              </div>
            </>
          ) : (
            <>
              <label className="label">Token logo (optional)</label>
              <input type="file" accept="image/*" onChange={onLogoPick} disabled={busy} />
              {tokenLogoData && (
                <div className="token-meta" style={{ marginTop: 6 }}>
                  <img src={tokenLogoData} alt="" className="token-icon" />
                  <span className="muted">Logo preview</span>
                </div>
              )}
              <p className="muted" style={{ fontSize: 11 }}>Without a logo, the ticker symbol is shown instead.</p>
            </>
          )}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={addToken}>
            {addingToken ? 'Adding…' : 'Add token'}
          </button>
          <div className="label" style={{ marginTop: 8 }}>Add NFT collection</div>
          <input value={nftAddr} onChange={(e) => setNftAddr(e.target.value)} placeholder="ERC721 contract" disabled={busy} />
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={addNft}>Track NFTs</button>
          {msg && <p className={msgError ? 'error' : 'success'}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}