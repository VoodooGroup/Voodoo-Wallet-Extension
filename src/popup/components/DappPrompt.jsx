import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { shortenAddress } from '../../lib/wallet';
import { describeDappRequest } from '../../lib/dapp-display';
import { formatEther } from 'ethers';
import { notifyTransferSent } from '../../lib/notify-transfer';
import { sendRuntimeMessage } from '../../lib/runtime-message.js';
import { useProfilePicture } from '../../context/ProfilePictureContext.jsx';
import { appBrandLogoUrl } from '../../lib/assets.js';

/**
 * Resolve display addresses for every wallet account (HD or single private key).
 */
async function resolveAccountRows(vault, accounts) {
  if (!vault || !accounts?.length) return [];
  const { deriveAccountFromMnemonic, walletFromPrivateKey } = await import('../../lib/wallet');

  if (vault.type === 'privateKey' || vault.type === 'imported') {
    try {
      const w = walletFromPrivateKey(vault.secret);
      return accounts.map((a) => ({
        id: a.id,
        name: a.name || 'Account',
        address: w.address,
      }));
    } catch {
      return [];
    }
  }

  const rows = [];
  for (const a of accounts) {
    try {
      const w = await deriveAccountFromMnemonic(vault.secret, a.derivationIndex ?? 0);
      rows.push({
        id: a.id,
        name: a.name || `Account ${Number(a.derivationIndex || 0) + 1}`,
        address: w.address,
      });
    } catch {
      rows.push({
        id: a.id,
        name: a.name || 'Account',
        address: '',
      });
    }
  }
  return rows;
}

/**
 * Local UX phases for approve / stake after user taps Confirm:
 * review → sending → mining (loader %) → success (green check)
 * Kept in local state so the success screen survives clearing pending.sign.
 */
const PHASE_REVIEW = 'review';
const PHASE_SENDING = 'sending';
const PHASE_MINING = 'mining';
const PHASE_SUCCESS = 'success';

export default function DappPrompt() {
  const { t } = useI18n();
  const {
    signer,
    address,
    unlocked,
    activeAccount,
    activeAccountId,
    accounts,
    vault,
    switchAccount,
  } = useWallet();
  const { profilePicture } = useProfilePicture();
  const accountAvatarSrc = profilePicture || appBrandLogoUrl();
  const [pending, setPending] = useState({ connect: null, sign: null });
  const [busy, setBusy] = useState(false);
  const [signError, setSignError] = useState('');
  /** false = not enough PLS for gas → Confirm disabled (no red warning) */
  const [canPayGas, setCanPayGas] = useState(true);
  const [gasChecking, setGasChecking] = useState(false);
  const [accountRows, setAccountRows] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const mountedRef = useRef(true);

  // Post-confirm UX (survives pending.sign clear after hash is returned to dApp)
  const [txPhase, setTxPhase] = useState(PHASE_REVIEW);
  const [progress, setProgress] = useState(0);
  const [successInfo, setSuccessInfo] = useState(null);
  /** Snapshot of sign details while mining/success (pending may clear) */
  const [frozenDetails, setFrozenDetails] = useState(null);
  const progressTimerRef = useRef(null);
  const [gasEstimateLabel, setGasEstimateLabel] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const refresh = useCallback(() => {
    // Don't poll away success/mining UI
    if (txPhase === PHASE_SENDING || txPhase === PHASE_MINING || txPhase === PHASE_SUCCESS) {
      return;
    }
    sendRuntimeMessage({ type: 'DAPP_GET_PENDING' }, (res) => {
      if (!mountedRef.current || !res) return;
      setPending(res);
    });
  }, [txPhase]);

  useEffect(() => {
    if (!unlocked) return undefined;
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [unlocked, refresh]);

  // Load account list when a connect request is pending
  useEffect(() => {
    if (!unlocked || !pending.connect || !vault) {
      setAccountRows([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const rows = await resolveAccountRows(vault, accounts);
      if (cancelled || !mountedRef.current) return;
      setAccountRows(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        if (activeAccountId && rows.some((r) => r.id === activeAccountId)) return activeAccountId;
        return rows[0]?.id || '';
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked, pending.connect?.id, vault, accounts, activeAccountId]);

  const signDetails = useMemo(() => {
    if (!pending.sign) return null;
    return describeDappRequest(pending.sign.method, pending.sign.params, t);
  }, [pending.sign, t]);

  useEffect(() => {
    // Show a sane Est. gas for approve / stake / unstake (never inflated dApp gas hex)
    if (!pending.sign || !signDetails?.gasHint || txPhase !== PHASE_REVIEW) {
      setGasEstimateLabel('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { getGasPriceWei, formatPlsAmount, FALLBACK_GAS_LIMITS } = await import('../../lib/gas.js');
        const price = await getGasPriceWei();
        const key = signDetails.gasHint || 'transfer';
        // Always prefer known-safe fallback — dApp gas hex caused ~50 PLS nonsense
        let limit = FALLBACK_GAS_LIMITS[key] || FALLBACK_GAS_LIMITS.transfer || 100_000n;
        // Only trust dApp gas for stake/unstake when in a normal range
        if (signDetails.kind !== 'approve') {
          const rawLimit = signDetails.gasLimit;
          if (rawLimit != null && rawLimit !== '') {
            try {
              const parsed = BigInt(rawLimit);
              if (parsed > 0n && parsed < 2_000_000n) limit = parsed;
            } catch {
              /* keep fallback */
            }
          }
        }
        const cost = price > 0n ? limit * price : 0n;
        if (cancelled) return;
        if (cost > 0n) {
          const n = Number(formatPlsAmount(cost));
          let short;
          if (!Number.isFinite(n)) short = formatPlsAmount(cost);
          else if (n >= 10) short = n.toFixed(1);
          else if (n >= 1) short = n.toFixed(2);
          else if (n >= 0.01) short = n.toFixed(3);
          else short = n.toFixed(4);
          short = short.replace(/\.?0+$/, '');
          setGasEstimateLabel(`~${short} PLS`);
        } else {
          setGasEstimateLabel('');
        }
      } catch {
        if (!cancelled) setGasEstimateLabel('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending.sign?.id, signDetails?.gasHint, signDetails?.gasLimit, signDetails?.kind, t, txPhase]);

  // Pre-check PLS for gas: disable Confirm until wallet can pay fees (no red error).
  useEffect(() => {
    if (!pending.sign || !signer || txPhase !== PHASE_REVIEW) {
      setCanPayGas(true);
      setGasChecking(false);
      return undefined;
    }
    // Sign-only methods need no gas
    const method = pending.sign.method;
    if (method === 'personal_sign' || method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
      setCanPayGas(true);
      setGasChecking(false);
      return undefined;
    }

    let cancelled = false;
    setGasChecking(true);
    (async () => {
      try {
        const { checkPlsCoverage, FALLBACK_GAS_LIMITS } = await import('../../lib/gas.js');
        const kind = signDetails?.kind;
        let fallback = FALLBACK_GAS_LIMITS.transfer || 100_000n;
        if (kind === 'approve') fallback = FALLBACK_GAS_LIMITS.approve;
        else if (kind === 'stake') fallback = FALLBACK_GAS_LIMITS.stake;
        else if (kind === 'unstake') fallback = FALLBACK_GAS_LIMITS.unstake;

        // Prefer dApp gas limit when sane
        const rawLimit = signDetails?.gasLimit ?? pending.sign.params?.[0]?.gas
          ?? pending.sign.params?.[0]?.gasLimit;
        if (rawLimit != null && rawLimit !== '') {
          try {
            const parsed = BigInt(rawLimit);
            if (parsed > 0n && parsed < 2_000_000n) fallback = parsed;
          } catch {
            /* keep fallback */
          }
        }

        let valueWei = 0n;
        const rawVal = pending.sign.params?.[0]?.value;
        if (rawVal != null && rawVal !== '' && rawVal !== '0x' && rawVal !== '0x0') {
          try {
            valueWei = BigInt(rawVal);
          } catch {
            valueWei = 0n;
          }
        }

        const coverage = await checkPlsCoverage(signer, {
          valueWei,
          estimateFn: async () => {
            throw new Error('use fallback limit');
          },
          fallbackGasLimit: fallback,
        });
        if (!cancelled) setCanPayGas(Boolean(coverage.ok));
      } catch {
        // Don't block the user if the check itself fails
        if (!cancelled) setCanPayGas(true);
      } finally {
        if (!cancelled) setGasChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending.sign?.id, pending.sign?.method, signer, signDetails?.kind, signDetails?.gasLimit, txPhase]);

  // Smooth progress while waiting for chain confirmation
  useEffect(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (txPhase === PHASE_SENDING) {
      setProgress(12);
      return undefined;
    }
    if (txPhase === PHASE_MINING) {
      progressTimerRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 92) return 92;
          if (p < 40) return p + 4;
          if (p < 70) return p + 2;
          return p + 1;
        });
      }, 450);
      return () => {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      };
    }
    return undefined;
  }, [txPhase]);

  const selectedRow = useMemo(
    () => accountRows.find((r) => r.id === selectedId) || accountRows[0] || null,
    [accountRows, selectedId],
  );

  const clearTxUx = useCallback(() => {
    setTxPhase(PHASE_REVIEW);
    setProgress(0);
    setSuccessInfo(null);
    setFrozenDetails(null);
    setSignError('');
    setBusy(false);
    setCanPayGas(true);
    setGasChecking(false);
    sendRuntimeMessage({ type: 'DAPP_GET_PENDING' }, (res) => {
      if (!mountedRef.current || !res) return;
      setPending(res);
    });
  }, []);

  // Bottom-nav (or other in-wallet navigation): dismiss overlay like Cancel
  useEffect(() => {
    const onNavAway = () => {
      if (!mountedRef.current) return;
      // Background already got DAPP_REJECT_* from App; clear local overlay state
      setPending({ connect: null, sign: null });
      setTxPhase(PHASE_REVIEW);
      setProgress(0);
      setSuccessInfo(null);
      setFrozenDetails(null);
      setSignError('');
      setBusy(false);
      setCanPayGas(true);
      setGasChecking(false);
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
    window.addEventListener('voodoo:nav-away', onNavAway);
    return () => window.removeEventListener('voodoo:nav-away', onNavAway);
  }, []);

  const rejectConnect = () => {
    sendRuntimeMessage({ type: 'DAPP_REJECT_CONNECT' }, refresh);
  };

  const approveConnect = async () => {
    if (!pending.connect) return;
    if (!selectedRow?.address && !address) {
      setSignError(t('dapp_unlock_first'));
      return;
    }
    setSignError('');
    setBusy(true);
    try {
      if (selectedId && selectedId !== activeAccountId) {
        await switchAccount(selectedId);
      }
      const chosenAddress = selectedRow?.address || address;
      sendRuntimeMessage({
        type: 'DAPP_APPROVE_CONNECT',
        origin: pending.connect.origin,
        address: chosenAddress,
      }, refresh);
    } catch (err) {
      setSignError(err?.message || t('dapp_sign_failed'));
    } finally {
      setBusy(false);
    }
  };

  const rejectSign = () => {
    if (txPhase === PHASE_SENDING || txPhase === PHASE_MINING) return;
    sendRuntimeMessage({ type: 'DAPP_REJECT_SIGN' }, () => {
      clearTxUx();
      refresh();
    });
  };

  const approveSign = async () => {
    if (!signer || !pending.sign) return;
    if (txPhase !== PHASE_REVIEW) return;
    // Block click when not enough PLS for gas — no red error, button stays disabled
    if (!canPayGas || gasChecking) return;

    setBusy(true);
    setSignError('');
    const details = signDetails;
    setFrozenDetails(details);
    setTxPhase(PHASE_SENDING);
    setProgress(10);

    try {
      const { method, params } = pending.sign;
      let result;
      let waitTx = null;

      if (method === 'personal_sign') {
        let message = params[0];
        if (typeof params[0] === 'string' && params[0].length === 42 && params[1]) {
          message = params[1];
        }
        result = await signer.signMessage(message);
      } else if (method === 'eth_sendTransaction') {
        const raw = params[0] || {};
        const { sendDappTransaction } = await import('../../lib/dapp-send-tx.js');
        const { hash, tx } = await sendDappTransaction(signer, raw);
        result = hash;
        waitTx = tx;

        // Return hash to dApp immediately so site leaves "Confirm…"
        await new Promise((resolve) => {
          sendRuntimeMessage({ type: 'DAPP_APPROVE_SIGN', result }, () => resolve());
          setTimeout(resolve, 600);
        });

        // Mining phase — loader advances until chain confirms
        if (mountedRef.current) {
          setTxPhase(PHASE_MINING);
          setProgress((p) => Math.max(p, 38));
        }

        let receipt = null;
        try {
          receipt = await Promise.race([
            waitTx?.wait?.(1) || Promise.resolve(null),
            new Promise((resolve) => {
              setTimeout(() => resolve(null), 90_000);
            }),
          ]);
        } catch {
          receipt = null;
        }

        // If wait hung/null, still treat as submitted success after timeout
        // (public RPC may lag; hash was already accepted)
        if (receipt && Number(receipt.status) === 0) {
          throw new Error(t('dapp_tx_reverted') || 'Transaction reverted on-chain');
        }

        if (receipt?.status === 1) {
          const value = raw.value && raw.value !== '0x0' && raw.value !== '0x'
            ? BigInt(raw.value)
            : 0n;
          if (value > 0n) {
            notifyTransferSent({
              amount: formatEther(value),
              symbol: 'PLS',
              to: raw.to,
              accountName: activeAccount?.name,
              hash,
            });
          }
        }

        // Cache VDO approval in wallet stake module when approve succeeds
        if (details?.kind === 'approve' && address) {
          try {
            const { rememberVdoApproval } = await import('../../lib/staking.js');
            rememberVdoApproval(address, true);
          } catch {
            /* optional */
          }
        }
      } else if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
        const typed = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
        result = await signer.signTypedData(typed.domain, typed.types, typed.message);
        await new Promise((resolve) => {
          sendRuntimeMessage({ type: 'DAPP_APPROVE_SIGN', result }, () => resolve());
          setTimeout(resolve, 600);
        });
      } else {
        throw new Error('Unsupported sign method');
      }

      // Sign-only methods (no mining) jump straight to success after deliver
      if (method !== 'eth_sendTransaction') {
        // already delivered above for typed? personal_sign needs deliver
        if (method === 'personal_sign') {
          await new Promise((resolve) => {
            sendRuntimeMessage({ type: 'DAPP_APPROVE_SIGN', result }, () => resolve());
            setTimeout(resolve, 600);
          });
        }
      }

      if (!mountedRef.current) return;

      setProgress(100);
      setTxPhase(PHASE_SUCCESS);
      setSuccessInfo({
        kind: details?.kind || 'tx',
        title: successTitle(details?.kind, t),
        subtitle: successSubtitle(details?.kind, details, t),
        amountLine: details?.kind === 'stake'
          ? details.lines?.find((l) => l.emphasize)?.value
          : null,
      });
      setBusy(false);

      // Auto-close success after a short celebration
      setTimeout(() => {
        if (mountedRef.current) clearTxUx();
      }, 3200);
    } catch (err) {
      console.error('[DappPrompt] approveSign failed', err);
      if (!mountedRef.current) return;
      setTxPhase(PHASE_REVIEW);
      setProgress(0);
      setFrozenDetails(null);
      setBusy(false);

      // Insufficient gas/funds → disable Confirm, never show red RPC text
      const msg = `${err?.shortMessage || ''} ${err?.message || ''} ${err?.info?.error?.message || ''}`;
      const isFunds = err?.code === 'INSUFFICIENT_FUNDS'
        || /insufficient funds|intrinsic transaction cost|insufficient balance/i.test(msg);
      if (isFunds) {
        setCanPayGas(false);
        setSignError('');
        return;
      }
      setSignError(err?.shortMessage || err?.message || t('dapp_sign_failed'));
    }
  };

  if (!unlocked) return null;

  // —— Success / progress overlay (after Confirm) ——
  if (txPhase === PHASE_SENDING || txPhase === PHASE_MINING || txPhase === PHASE_SUCCESS) {
    const kind = successInfo?.kind || frozenDetails?.kind || 'tx';
    const isSuccess = txPhase === PHASE_SUCCESS;
    const pct = Math.min(100, Math.round(progress));
    const statusText = isSuccess
      ? (successInfo?.title || t('dapp_success') || 'Success')
      : txPhase === PHASE_SENDING
        ? (t('dapp_status_sending') || 'Submitting…')
        : (t('dapp_status_confirming') || 'Confirming on PulseChain…');

    return (
      <div className="dapp-prompt" role="dialog" aria-modal="true" aria-labelledby="dapp-tx-status">
        <div className="dapp-prompt-panel">
          <div className="dapp-prompt-body dapp-status-body">
            <div className={`dapp-status-card${isSuccess ? ' is-success' : ''}`}>
              {isSuccess ? (
                <div className="dapp-success-icon-wrap" aria-hidden>
                  {/* Inline SVG: green check on white — no black plate from source PNG */}
                  <svg className="dapp-success-svg" viewBox="0 0 64 64" width="56" height="56">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray="140 44"
                      strokeDashoffset="12"
                      transform="rotate(-90 32 32)"
                    />
                    <path
                      d="M18 33.5 L27.5 43 L46.5 22"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="5.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              ) : (
                <div className="dapp-progress-ring" aria-hidden>
                  <svg viewBox="0 0 72 72" className="dapp-progress-svg">
                    <circle className="dapp-progress-track" cx="36" cy="36" r="30" />
                    <circle
                      className="dapp-progress-bar"
                      cx="36"
                      cy="36"
                      r="30"
                      style={{
                        strokeDasharray: `${2 * Math.PI * 30}`,
                        strokeDashoffset: `${2 * Math.PI * 30 * (1 - pct / 100)}`,
                      }}
                    />
                  </svg>
                  <span className="dapp-progress-pct">{pct}%</span>
                </div>
              )}

              <h2 id="dapp-tx-status" className="dapp-status-title">
                {statusText}
              </h2>

              {isSuccess && successInfo?.amountLine && (
                <p className="dapp-status-amount">{successInfo.amountLine}</p>
              )}

              <p className="dapp-status-sub">
                {isSuccess
                  ? (successInfo?.subtitle || t('dapp_success_hint') || 'You can return to the site.')
                  : (t('dapp_status_wait') || 'Please keep this window open…')}
              </p>

              {!isSuccess && (
                <div className="dapp-progress-track-line" aria-hidden>
                  <div className="dapp-progress-track-fill" style={{ width: `${pct}%` }} />
                </div>
              )}

              {isSuccess && (
                <button type="button" className="btn btn-primary dapp-status-done" onClick={clearTxUx}>
                  {t('done') || 'Done'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pending.connect) {
    const rows = accountRows.length
      ? accountRows
      : [{
        id: activeAccountId || '0',
        name: activeAccount?.name || t('account') || 'Account 1',
        address: address || '',
      }];

    // Simple connect: title + account picker + buttons
    return (
      <div
        className="dapp-prompt dapp-prompt--simple"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dapp-connect-heading"
      >
        <div className="dapp-prompt-panel dapp-prompt-panel--simple">
          <div className="dapp-simple-body">
            <h2 id="dapp-connect-heading" className="dapp-simple-title">
              {t('dapp_connect_title') || 'Connect with Voodoo Wallet'}
            </h2>
            <p className="dapp-simple-kicker">{t('dapp_accounts') || 'Account'}</p>
            <div className="dapp-account-list dapp-account-list--simple" role="radiogroup">
              {rows.map((row) => {
                const selected = row.id === (selectedId || rows[0]?.id);
                return (
                  <button
                    key={row.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`dapp-account-row dapp-account-row--simple${selected ? ' dapp-account-row-active' : ''}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <img
                      src={accountAvatarSrc}
                      alt=""
                      className={`dapp-account-avatar-img${profilePicture ? ' is-profile' : ''}`}
                      width={40}
                      height={40}
                      draggable={false}
                    />
                    <div className="dapp-account-main">
                      <span className="dapp-account-name">{row.name}</span>
                      <span className="dapp-account-addr">
                        {row.address ? shortenAddress(row.address, 5) : '—'}
                      </span>
                    </div>
                    <span className={`dapp-account-radio${selected ? ' is-on' : ''}`} aria-hidden />
                  </button>
                );
              })}
            </div>
            {signError && <p className="error dapp-prompt-error">{signError}</p>}
          </div>
          <div className="dapp-actions dapp-actions--simple">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={rejectConnect}>
              {t('cancel') || 'Cancel'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (!selectedRow?.address && !address)}
              onClick={approveConnect}
            >
              {busy ? t('dapp_confirming') : (t('connect') || 'Connect')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.sign && signDetails) {
    const isStake = signDetails.kind === 'stake';
    const isApprove = signDetails.kind === 'approve';
    const isUnstake = signDetails.kind === 'unstake';
    const isSimple = isStake || isApprove || isUnstake;
    const primaryLabel = busy
      ? t('dapp_confirming')
      : (isApprove
        ? (t('approve') || 'Approve')
        : (signDetails.primaryAction || t('confirm') || t('approve')));

    let detailLines = [...(signDetails.lines || [])];

    // Always show full Approve detail card (never leave screen as title-only)
    if (isApprove) {
      const hasAction = detailLines.some((l) => /action/i.test(l.label || ''));
      const hasAllow = detailLines.some((l) => /allow/i.test(l.label || ''));
      if (!hasAction) {
        detailLines.unshift({
          label: 'Action',
          value: 'Token Approval',
        });
      }
      if (!hasAllow) {
        detailLines.splice(1, 0, {
          label: 'Allow',
          value: 'VDO',
        });
      }
    }

    // Est. gas (sane estimate — not inflated ~50 PLS)
    if (gasEstimateLabel && !detailLines.some((l) => /gas|fee/i.test(l.label || ''))) {
      detailLines.push({
        label: 'Est. gas',
        value: gasEstimateLabel,
      });
    } else if (isApprove && !gasEstimateLabel && !detailLines.some((l) => /gas|fee/i.test(l.label || ''))) {
      // Placeholder while estimate loads so the card never looks empty
      detailLines.push({
        label: 'Est. gas',
        value: '…',
      });
    }

    const amountLine = detailLines.find((l) => l.emphasize);
    const metaLines = detailLines.filter((l) => !l.emphasize);

    const confirmDisabled = busy || gasChecking || !canPayGas;
    // Never surface raw RPC "insufficient funds for intrinsic…" text
    const safeError = signError && !/insufficient funds|intrinsic transaction cost|insufficient balance/i.test(signError)
      ? signError
      : '';

    return (
      <div
        className={`dapp-prompt dapp-prompt--simple${isSimple ? ' dapp-prompt--fit' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dapp-sign-heading"
      >
        <div className="dapp-prompt-panel dapp-prompt-panel--simple">
          <div className="dapp-simple-body">
            <h2 id="dapp-sign-heading" className="dapp-simple-title">
              {isApprove ? (t('approve') || 'Approve') : signDetails.title}
            </h2>

            {isApprove && (
              <p className="dapp-simple-subtitle">
                {t('dapp_approve_vdo') || 'Allow VDO for staking'}
              </p>
            )}

            {amountLine && (
              <div className="dapp-amount-chip dapp-amount-chip--simple" aria-label={amountLine.label}>
                <span className="dapp-amount-chip-value">{amountLine.value}</span>
              </div>
            )}

            {metaLines.length > 0 && (
              <div className="dapp-simple-meta">
                {metaLines.map((line, idx) => (
                  <div key={`${line.label}-${idx}`} className="dapp-simple-meta-row">
                    <span>{line.label}</span>
                    <strong>{line.value}</strong>
                  </div>
                ))}
              </div>
            )}

            {safeError && (
              <p className="dapp-warning dapp-prompt-error" role="alert">{safeError}</p>
            )}
          </div>
          <div className="dapp-actions dapp-actions--simple" role="group" aria-label={t('dapp_actions') || 'Actions'}>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={rejectSign}>
              {t('reject') || 'Reject'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={confirmDisabled}
              title={!canPayGas ? (t('low_pls_gas') || 'Add PLS for gas') : undefined}
              onClick={approveSign}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function successTitle(kind, t) {
  if (kind === 'approve') return t('dapp_success_approve') || 'Approved';
  if (kind === 'stake') return t('dapp_success_stake') || 'Stake successful';
  if (kind === 'unstake') return t('dapp_success_unstake') || 'Unstake successful';
  return t('dapp_success') || 'Success';
}

function successSubtitle(kind, details, t) {
  if (kind === 'approve') {
    return t('dapp_success_approve_hint') || 'You can stake VDO on the site now.';
  }
  if (kind === 'stake') {
    return t('dapp_success_stake_hint') || 'Your VDO is now staked on PulseChain.';
  }
  if (kind === 'unstake') {
    return t('dapp_success_unstake_hint') || 'Unstake completed.';
  }
  return t('dapp_success_hint') || 'You can return to the site.';
}
