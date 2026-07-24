import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { DEFAULT_TOKENS } from '../../config/pulsechain';
import { DEFAULT_SLIPPAGE_BPS } from '../../config/swap';
import TokenIcon from '../../components/TokenIcon';
import PopupSelect from '../../components/PopupSelect';
import SwapErrorModal from '../../components/SwapErrorModal';
import { formatTxError } from '../../lib/gas';
import { parseSendBlocker } from '../../lib/send-blocker';
import {
  approveTokenForSwap,
  buildSwapTokenList,
  canQuoteSwapAmount,
  checkApprovePlsFunds,
  checkSwapApproval,
  checkSwapPlsFunds,
  executeSwap,
  findSwapToken,
  formatSwapUiAmount,
  getBestSwapQuote,
  sanitizeSwapAmountInput,
} from '../../lib/swap';
import {
  estimateSwapInput,
  estimateSwapOutput,
  fetchDexSwapRates,
} from '../../lib/swap-quote-estimate';
import { assetUrl } from '../../lib/assets';

const SLIPPAGE_PRESETS = [
  { pct: 1, bps: 100 },
  { pct: 2, bps: 200 },
  { pct: 5, bps: 500 },
];

function slippageBpsFromPct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 50) return 5000; // hard cap 50%
  return Math.round(n * 100);
}

function formatSlippageLabel(bps) {
  const pct = bps / 100;
  if (Number.isInteger(pct)) return `${pct}%`;
  return `${pct}%`.replace(/\.?0+$/, '');
}

function swapTokenIconSrc(tok) {
  if (tok?.logoData) return tok.logoData;
  if (tok?.logo) return assetUrl(tok.logo) || null;
  return null;
}

function sameAmount(a, b) {
  if (a === b) return true;
  if (a == null || b == null || a === '' || b === '') return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  if (na === 0 && nb === 0) return true;
  return Math.abs(na - nb) / Math.max(Math.abs(na), Math.abs(nb), 1e-18) < 1e-10;
}

export default function Swap() {
  const { t } = useI18n();
  const { signer, address, plsBalance, tokens, prices, refresh } = useWallet();

  const swapTokens = useMemo(
    () => buildSwapTokenList(tokens, plsBalance),
    [tokens, plsBalance],
  );

  const vdoKey = DEFAULT_TOKENS.find((tok) => tok.symbol === 'VDO')?.address || 'PLS';
  const [fromKey, setFromKey] = useState('PLS');
  const [toKey, setToKey] = useState(vdoKey);
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  /** 'in' = user typed pay amount; 'out' = user typed receive amount */
  const [lastEdited, setLastEdited] = useState('in');
  const [quote, setQuote] = useState(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [approved, setApproved] = useState(true);
  const [approving, setApproving] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [errorBlocker, setErrorBlocker] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [dexRates, setDexRates] = useState(null);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [slippageOpen, setSlippageOpen] = useState(false);
  const [slippageMode, setSlippageMode] = useState('1'); // '1' | '2' | '5' | 'custom'
  const [customSlippage, setCustomSlippage] = useState('');
  const quoteRequestRef = useRef(0);
  const swapTokensRef = useRef(swapTokens);
  const slippagePanelRef = useRef(null);
  swapTokensRef.current = swapTokens;

  useEffect(() => {
    if (!slippageOpen) return undefined;
    const onDown = (e) => {
      if (slippagePanelRef.current && !slippagePanelRef.current.contains(e.target)) {
        setSlippageOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setSlippageOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [slippageOpen]);

  const applySlippagePreset = (pct) => {
    const preset = SLIPPAGE_PRESETS.find((p) => p.pct === pct);
    if (!preset) return;
    setSlippageMode(String(pct));
    setSlippageBps(preset.bps);
    setCustomSlippage('');
  };

  const applyCustomSlippage = (raw) => {
    const cleaned = String(raw).replace(/[^\d.]/g, '');
    setCustomSlippage(cleaned);
    setSlippageMode('custom');
    const bps = slippageBpsFromPct(cleaned);
    if (bps != null) setSlippageBps(bps);
  };

  const showSwapError = useCallback((error) => {
    const blocker = parseSendBlocker(error, t);
    if (blocker.reason === 'generic') {
      setErrorBlocker({
        ...blocker,
        body: formatTxError(error) || t('error_tx_failed_generic'),
      });
      return;
    }
    setErrorBlocker(blocker);
  }, [t]);

  const clearSwapError = useCallback(() => {
    setErrorBlocker(null);
  }, []);

  const fromToken = findSwapToken(swapTokens, fromKey);
  const toToken = findSwapToken(swapTokens, toKey);

  const exactOut = lastEdited === 'out';
  const typedAmount = exactOut ? amountOut : amountIn;

  const localEstimate = useMemo(() => {
    if (exactOut) {
      if (!canQuoteSwapAmount(amountOut, toToken.decimals ?? 18)) return null;
      return estimateSwapInput(amountOut, fromToken, toToken, prices, dexRates);
    }
    if (!canQuoteSwapAmount(amountIn, fromToken.decimals ?? 18)) return null;
    return estimateSwapOutput(amountIn, fromToken, toToken, prices, dexRates);
  }, [exactOut, amountIn, amountOut, fromToken, toToken, prices, dexRates]);

  const swapAddressKey = useMemo(
    () => [...new Set(
      swapTokens
        .filter((tok) => !tok.isNative && tok.address)
        .map((tok) => tok.address.toLowerCase()),
    )].sort().join(','),
    [swapTokens],
  );

  useEffect(() => {
    let cancelled = false;
    const tokenAddresses = swapAddressKey ? swapAddressKey.split(',') : [];
    fetchDexSwapRates({ tokenAddresses })
      .then((rates) => { if (!cancelled) setDexRates(rates); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [swapAddressKey]);

  const selectOptions = useMemo(
    () => swapTokens.map((tok) => ({
      value: tok.key,
      label: tok.symbol,
      sublabel: `${formatSwapUiAmount(tok.balance)} ${tok.symbol}`,
      icon: swapTokenIconSrc(tok),
    })),
    [swapTokens],
  );

  const flip = () => {
    setFromKey(toKey);
    setToKey(fromKey);
    setAmountIn(amountOut);
    setAmountOut(amountIn);
    setQuote(null);
    setTxHash('');
    clearSwapError();
  };

  const useMax = () => {
    const bal = Number(fromToken?.balance || 0);
    if (bal <= 0) return;
    setLastEdited('in');
    if (fromToken.isNative) {
      setAmountIn(String(Math.max(0, bal - 0.01)));
    } else {
      setAmountIn(String(bal));
    }
    setTxHash('');
    clearSwapError();
  };

  useEffect(() => {
    if (!swapTokens.some((tok) => tok.key === fromKey)) {
      setFromKey(swapTokens[0]?.key || 'PLS');
    }
    if (!swapTokens.some((tok) => tok.key === toKey)) {
      setToKey(swapTokens[1]?.key || swapTokens[0]?.key || 'PLS');
    }
  }, [swapTokens, fromKey, toKey]);

  useEffect(() => {
    if (!address || fromToken.isNative || !fromToken.address || !quote?.router?.address) {
      setApproved(true);
      return undefined;
    }
    let cancelled = false;
    checkSwapApproval(address, fromToken.address, quote.router.address)
      .then((ok) => { if (!cancelled) setApproved(ok); })
      .catch(() => { if (!cancelled) setApproved(false); });
    return () => { cancelled = true; };
  }, [address, fromToken.isNative, fromToken.address, quote?.router?.address]);

  // Quote when typed amount / pair / direction changes (stable deps — no loop)
  useEffect(() => {
    const from = findSwapToken(swapTokensRef.current, fromKey);
    const to = findSwapToken(swapTokensRef.current, toKey);
    const decimals = exactOut ? (to.decimals ?? 18) : (from.decimals ?? 18);
    const quoteable = fromKey !== toKey && canQuoteSwapAmount(typedAmount, decimals);

    if (!quoteable) {
      setQuote(null);
      setQuoteError('');
      setQuoteBusy(false);
      if (!typedAmount || Number(typedAmount) <= 0) {
        if (exactOut) setAmountIn('');
        else setAmountOut('');
      }
      return undefined;
    }

    const requestId = quoteRequestRef.current + 1;
    quoteRequestRef.current = requestId;
    setQuoteBusy(true);
    setQuoteError('');

    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const best = await getBestSwapQuote({
          amountIn: exactOut ? undefined : typedAmount,
          amountOut: exactOut ? typedAmount : undefined,
          fromToken: from,
          toToken: to,
          exactOut,
        });
        if (cancelled || quoteRequestRef.current !== requestId) return;
        if (!best) {
          setQuote(null);
          setQuoteError(t('swap_no_route'));
          if (exactOut) setAmountIn('');
          else setAmountOut('');
          return;
        }
        setQuote(best);
        setQuoteError('');
        // Only write the *other* field — never the one the user is typing
        if (exactOut) {
          setAmountIn((prev) => (
            sameAmount(prev, best.amountInFormatted) ? prev : best.amountInFormatted
          ));
        } else {
          setAmountOut((prev) => (
            sameAmount(prev, best.amountOutFormatted) ? prev : best.amountOutFormatted
          ));
        }
      } catch (e) {
        if (cancelled || quoteRequestRef.current !== requestId) return;
        setQuote(null);
        setQuoteError(formatTxError(e) || t('swap_quote_failed'));
        if (exactOut) setAmountIn('');
        else setAmountOut('');
      } finally {
        if (!cancelled && quoteRequestRef.current === requestId) {
          setQuoteBusy(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [typedAmount, exactOut, fromKey, toKey, t]);

  const handleApprove = async () => {
    if (!signer || !fromToken.address || !quote?.router?.address) return;
    setApproving(true);
    clearSwapError();
    try {
      const gasCheck = await checkApprovePlsFunds(
        signer,
        fromToken.address,
        quote.router.address,
      );
      if (!gasCheck.ok && gasCheck.blocker) {
        setErrorBlocker({ ...gasCheck.blocker, hint: t('send_blocked_hint_pls') });
        return;
      }
      await approveTokenForSwap(signer, fromToken.address, quote.router.address);
      setApproved(true);
    } catch (e) {
      showSwapError(e);
    } finally {
      setApproving(false);
    }
  };

  const handleSwap = async () => {
    const payStr = amountIn || (exactOut ? localEstimate?.amountInFormatted : '');
    if (!signer || !payStr || Number(payStr) <= 0 || fromKey === toKey) return;
    if (exactOut && (!amountOut || Number(amountOut) <= 0)) return;

    setSwapping(true);
    clearSwapError();
    setTxHash('');
    try {
      const payAmt = Number(payStr);
      const fromBal = Number(fromToken?.balance || 0);

      if (!fromToken.isNative && payAmt > fromBal) {
        setErrorBlocker({
          reason: 'insufficient_token',
          tokenSymbol: fromToken.symbol || 'TOKEN',
          tokenBalance: String(fromBal),
          tokenRequired: String(payAmt),
          shortfallPls: String(Math.max(0, payAmt - fromBal)),
          hint: t('send_blocked_hint_token', { symbol: fromToken.symbol || 'TOKEN' }),
        });
        return;
      }

      let activeQuote = quote && !quote.isEstimate ? quote : null;
      if (!activeQuote) {
        activeQuote = await getBestSwapQuote({
          amountIn: exactOut ? undefined : payStr,
          amountOut: exactOut ? amountOut : undefined,
          fromToken,
          toToken,
          exactOut,
        });
        if (activeQuote) {
          setQuote(activeQuote);
          if (exactOut) setAmountIn(activeQuote.amountInFormatted);
          else setAmountOut(activeQuote.amountOutFormatted);
        }
      }
      if (!activeQuote) {
        const pre = await checkSwapPlsFunds({
          signer,
          quote: null,
          amountIn: payStr,
          fromToken,
          toToken,
        });
        if (!pre.ok && pre.blocker) {
          setErrorBlocker({ ...pre.blocker, hint: t('send_blocked_hint_pls') });
          return;
        }
        setErrorBlocker({
          reason: 'generic',
          body: quoteError || t('swap_no_route'),
        });
        return;
      }

      const payForChecks = activeQuote.amountInFormatted || payStr;

      if (!fromToken.isNative && fromToken.address) {
        const ok = await checkSwapApproval(address, fromToken.address, activeQuote.router.address);
        if (!ok) {
          setApproved(false);
          setQuote(activeQuote);
          return;
        }
      }

      const funds = await checkSwapPlsFunds({
        signer,
        quote: activeQuote,
        amountIn: payForChecks,
        fromToken,
        toToken,
        slippageBps,
      });
      if (!funds.ok && funds.blocker) {
        setErrorBlocker({ ...funds.blocker, hint: t('send_blocked_hint_pls') });
        return;
      }

      const hash = await executeSwap({
        signer,
        quote: activeQuote,
        amountIn: payForChecks,
        fromToken,
        toToken,
        slippageBps,
      });
      setTxHash(hash);
      setAmountIn('');
      setAmountOut('');
      setQuote(null);
      await refresh();
    } catch (e) {
      showSwapError(e);
    } finally {
      setSwapping(false);
    }
  };

  // Display: typed field = state; opposite = quote or soft local estimate
  const shownIn = exactOut
    ? (amountIn || (quoteBusy ? (localEstimate?.amountInFormatted || '') : amountIn))
    : amountIn;
  const shownOut = !exactOut
    ? (amountOut || (quoteBusy ? (localEstimate?.amountOutFormatted || '') : amountOut))
    : amountOut;

  const canSwap = Boolean(
    signer
    && (amountIn || shownIn)
    && Number(amountIn || shownIn) > 0
    && fromKey !== toKey
    && canQuoteSwapAmount(amountIn || shownIn, fromToken.decimals ?? 18)
    && (!exactOut || (amountOut && Number(amountOut) > 0))
    && !swapping
    && !approving,
  );
  const needsApprove = !fromToken.isNative
    && quote
    && !quote?.isEstimate
    && !approved
    && canSwap;

  const slippageLabel = formatSlippageLabel(slippageBps);
  // Clean title meta: slippage only (route lives in the gear / quote, not the header)
  const routeLabel = quote?.router?.id === 'pulsex-v1'
    ? 'PulseX V1'
    : quote?.router?.id === 'pulsex-v2'
      ? 'PulseX V2'
      : 'PulseX';
  const metaText = quoteError && !(amountIn && amountOut)
    ? quoteError
    : t('swap_meta_slippage', { slippage: slippageLabel });
  const metaTitle = quoteError && !(amountIn && amountOut)
    ? quoteError
    : t('swap_meta_tooltip', { slippage: slippageLabel, route: routeLabel });

  return (
    <div className="swap-page">
      <div className="swap-card card">
        <div className="swap-title-row">
          <h2 className="swap-hero-title">{t('swap_title')}</h2>
          <div className="swap-title-actions" ref={slippagePanelRef}>
            <span className="muted swap-title-meta" title={metaTitle}>{metaText}</span>
            <button
              type="button"
              className={`swap-settings-btn${slippageOpen ? ' is-open' : ''}`}
              onClick={() => setSlippageOpen((v) => !v)}
              aria-label={t('swap_slippage_title')}
              aria-expanded={slippageOpen}
              title={t('swap_slippage_title')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M19.4 13a7.6 7.6 0 0 0 .05-1 7.6 7.6 0 0 0-.05-1l2-1.55a.5.5 0 0 0 .12-.64l-1.9-3.28a.5.5 0 0 0-.6-.22l-2.35.94a7.3 7.3 0 0 0-1.73-1L14.7 2.7a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.36 2.5a7.3 7.3 0 0 0-1.73 1l-2.35-.94a.5.5 0 0 0-.6.22L2.16 8.8a.5.5 0 0 0 .12.64L4.3 11a7.6 7.6 0 0 0 0 2l-2 1.55a.5.5 0 0 0-.12.64l1.9 3.28a.5.5 0 0 0 .6.22l2.35-.94a7.3 7.3 0 0 0 1.73 1l.36 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.36-2.5a7.3 7.3 0 0 0 1.73-1l2.35.94a.5.5 0 0 0 .6-.22l1.9-3.28a.5.5 0 0 0-.12-.64L19.4 13Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {slippageOpen && (
              <div className="swap-slippage-panel" role="dialog" aria-label={t('swap_slippage_title')}>
                <div className="swap-slippage-panel-title">{t('swap_slippage_title')}</div>
                <p className="muted swap-slippage-hint">{t('swap_slippage_hint')}</p>
                <div className="swap-slippage-presets">
                  {SLIPPAGE_PRESETS.map((p) => (
                    <button
                      key={p.pct}
                      type="button"
                      className={`swap-slippage-chip${slippageMode === String(p.pct) ? ' is-active' : ''}`}
                      onClick={() => applySlippagePreset(p.pct)}
                    >
                      {p.pct}%
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`swap-slippage-chip${slippageMode === 'custom' ? ' is-active' : ''}`}
                    onClick={() => {
                      setSlippageMode('custom');
                      if (!customSlippage) {
                        setCustomSlippage(String(slippageBps / 100));
                      }
                    }}
                  >
                    {t('swap_slippage_custom')}
                  </button>
                </div>
                {slippageMode === 'custom' && (
                  <div className="swap-slippage-custom-row">
                    <input
                      className="swap-slippage-custom-input"
                      type="text"
                      inputMode="decimal"
                      value={customSlippage}
                      onChange={(e) => applyCustomSlippage(e.target.value)}
                      placeholder="1.5"
                      aria-label={t('swap_slippage_custom')}
                      autoFocus
                    />
                    <span className="swap-slippage-custom-suffix">%</span>
                  </div>
                )}
                <p className="muted swap-slippage-current">
                  {t('swap_slippage_current', { slippage: slippageLabel })}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="swap-panel">
          <div className="swap-panel-head">
            <span className="label">{t('swap_from')}</span>
            <button type="button" className="swap-max-btn" onClick={useMax}>{t('max')}</button>
          </div>
          <div className="swap-panel-row">
            <input
              className={`swap-amount-input${exactOut && quoteBusy && !amountIn ? ' swap-amount-busy' : ''}`}
              value={shownIn}
              onChange={(e) => {
                setLastEdited('in');
                setAmountIn(sanitizeSwapAmountInput(e.target.value));
                setTxHash('');
                clearSwapError();
              }}
              placeholder={exactOut && quoteBusy ? '…' : '0'}
              inputMode="decimal"
            />
            <div className="swap-token-select">
              <TokenIcon symbol={fromToken.symbol} logo={fromToken.logo} logoData={fromToken.logoData} className="token-icon-sm" />
              <PopupSelect
                value={fromKey}
                onChange={(next) => {
                  setFromKey(next);
                  if (next === toKey) setToKey(fromKey);
                  clearSwapError();
                }}
                options={selectOptions}
                ariaLabel={t('swap_from')}
                searchPlaceholder={t('swap_search_token')}
                menuMinWidth={200}
              />
            </div>
          </div>
          <p className="muted swap-balance-hint" title={`${fromToken.balance} ${fromToken.symbol}`}>
            {t('swap_balance', {
              amount: formatSwapUiAmount(fromToken.balance),
              symbol: fromToken.symbol,
            })}
          </p>
        </div>

        <button type="button" className="swap-flip-btn" onClick={flip} aria-label={t('swap_flip')}>
          ↕
        </button>

        <div className="swap-panel swap-panel-to">
          <div className="swap-panel-head">
            <span className="label">{t('swap_to')}</span>
          </div>
          <div className="swap-panel-row">
            <input
              className={`swap-amount-input${!exactOut && quoteBusy && !amountOut ? ' swap-amount-busy' : ''}`}
              value={shownOut}
              onChange={(e) => {
                setLastEdited('out');
                setAmountOut(sanitizeSwapAmountInput(e.target.value));
                setTxHash('');
                clearSwapError();
              }}
              placeholder={!exactOut && quoteBusy ? '…' : '0'}
              inputMode="decimal"
            />
            <div className="swap-token-select">
              <TokenIcon symbol={toToken.symbol} logo={toToken.logo} logoData={toToken.logoData} className="token-icon-sm" />
              <PopupSelect
                value={toKey}
                onChange={(next) => {
                  setToKey(next);
                  if (next === fromKey) setFromKey(toKey);
                  clearSwapError();
                }}
                options={selectOptions}
                ariaLabel={t('swap_to')}
                searchPlaceholder={t('swap_search_token')}
                menuMinWidth={200}
              />
            </div>
          </div>
          <p className="muted swap-balance-hint" title={`${toToken.balance} ${toToken.symbol}`}>
            {t('swap_balance', {
              amount: formatSwapUiAmount(toToken.balance),
              symbol: toToken.symbol,
            })}
          </p>
        </div>

        {needsApprove ? (
          <button type="button" className="btn btn-primary swap-submit-btn" disabled={approving} onClick={handleApprove}>
            {approving ? t('approving') : t('swap_approve', { symbol: fromToken.symbol })}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary swap-submit-btn"
            disabled={!canSwap}
            onClick={handleSwap}
          >
            {swapping ? t('swap_swapping') : t('swap_confirm')}
          </button>
        )}

        {txHash && (
          <p className="success swap-success-line" title={txHash}>
            {t('swap_success', { hash: `${txHash.slice(0, 10)}…` })}
          </p>
        )}
      </div>

      <SwapErrorModal
        open={Boolean(errorBlocker)}
        blocker={errorBlocker}
        onClose={clearSwapError}
      />
    </div>
  );
}
