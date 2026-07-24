import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { TOKEN_LOGOS } from '../../config/pulsechain';
import { estimateGasSend, sendNative, sendToken } from '../../lib/chain';
import { formatEther } from 'ethers';
import { parseSendBlocker } from '../../lib/send-validation.js';
import { buildSendConfirmPreview } from '../../lib/tx-preview.js';
import { normalizeAddress } from '../../lib/validate';
import SendConfirmModal from '../../components/SendConfirmModal';
import SwapErrorModal from '../../components/SwapErrorModal';
import PopupSelect from '../../components/PopupSelect';
import TokenIcon from '../../components/TokenIcon';
import { notifyTransferSent } from '../../lib/notify-transfer';
import { assetUrl } from '../../lib/assets';
import { getTransfer2faEnabled } from '../../lib/storage';
import { getSessionTotpSecret } from '../../lib/session';
import { translateError } from '../../lib/i18n/translate-error.js';

function sendBlockerFromError(error, t) {
  if (error?.blocker) return error.blocker;
  return parseSendBlocker(error, t);
}

/** Resolve token logo URL for PopupSelect (same approach as Swap). */
function sendTokenIconSrc(tok) {
  if (tok?.logoData) return tok.logoData;
  if (tok?.logo) return assetUrl(tok.logo) || null;
  const fallback = TOKEN_LOGOS[tok?.symbol];
  if (fallback) return assetUrl(fallback) || null;
  return null;
}

export default function Send() {
  const { t } = useI18n();
  const {
    signer, tokens, activeAccount, getTotpEnabled, verifyTransfer2fa,
  } = useWallet();
  const [asset, setAsset] = useState('PLS');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [gasInfo, setGasInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [formAlert, setFormAlert] = useState(null); // { title, body } popup
  const [hash, setHash] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmUi, setConfirmUi] = useState(null);
  const [requireTotp, setRequireTotp] = useState(false);
  const [needTotpPassword, setNeedTotpPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpPassword, setTotpPassword] = useState('');
  const [totpError, setTotpError] = useState('');

  const selectedToken = tokens.find((tok) => tok.symbol === asset);
  const checksumTo = normalizeAddress(to);

  const assetOptions = useMemo(() => {
    const list = [{
      value: 'PLS',
      label: 'PLS',
      icon: assetUrl(TOKEN_LOGOS.PLS) || null,
    }];
    const seen = new Set(['PLS']);
    for (const tok of tokens || []) {
      const symbol = tok.symbol || '';
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      list.push({
        value: symbol,
        label: symbol,
        icon: sendTokenIconSrc(tok),
      });
    }
    return list;
  }, [tokens]);

  const selectedAssetMeta = asset === 'PLS'
    ? { symbol: 'PLS', logo: TOKEN_LOGOS.PLS, logoData: undefined }
    : selectedToken;

  useEffect(() => {
    if (!signer || !checksumTo || !amount || Number(amount) <= 0) {
      setGasInfo(null);
      return;
    }
    const run = async () => {
      try {
        const info = await estimateGasSend({
          signer,
          to: checksumTo,
          amount,
          isNative: asset === 'PLS',
          tokenAddress: selectedToken?.address,
          decimals: selectedToken?.decimals || 18,
        });
        setGasInfo(info);
      } catch {
        setGasInfo(null);
      }
    };
    const id = setTimeout(run, 400);
    return () => clearTimeout(id);
  }, [signer, checksumTo, amount, asset, selectedToken]);

  const estCost = gasInfo?.gasLimit && gasInfo?.gasPrice
    ? formatEther(BigInt(gasInfo.gasLimit) * BigInt(gasInfo.gasPrice))
    : null;

  const closeConfirm = () => {
    setConfirming(false);
    setConfirmUi(null);
    setTotpCode('');
    setTotpPassword('');
    setTotpError('');
  };

  const openConfirm = async () => {
    setFormAlert(null);
    setTotpCode('');
    setTotpPassword('');
    setTotpError('');
    if (!checksumTo) {
      const empty = !String(to || '').trim();
      setFormAlert({
        reason: 'generic',
        title: empty
          ? t('error_missing_recipient_title')
          : t('error_invalid_recipient_title'),
        body: empty
          ? t('error_missing_recipient_body')
          : t('error_invalid_recipient_body'),
      });
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setFormAlert({
        reason: 'generic',
        title: t('error_invalid_amount_title'),
        body: t('error_invalid_amount_body'),
      });
      return;
    }
    if (asset !== 'PLS' && !selectedToken) {
      setFormAlert({
        reason: 'generic',
        title: t('error_invalid_token_title'),
        body: t('error_invalid_token_body'),
      });
      return;
    }

    setReviewBusy(true);
    try {
      const [transfer2faOn, totpOn, sessionSecret] = await Promise.all([
        getTransfer2faEnabled(),
        getTotpEnabled(),
        getSessionTotpSecret(),
      ]);
      const needs2fa = Boolean(transfer2faOn && totpOn);
      setRequireTotp(needs2fa);
      setNeedTotpPassword(needs2fa && !sessionSecret);

      const preview = await buildSendConfirmPreview({
        signer,
        to: checksumTo,
        amount,
        isNative: asset === 'PLS',
        token: selectedToken,
      });
      setConfirmUi({ phase: 'ready', preview, blocker: null });
      setConfirming(true);
    } catch (e) {
      setConfirmUi({
        phase: 'blocked',
        preview: null,
        blocker: sendBlockerFromError(e, t),
      });
      setConfirming(true);
    } finally {
      setReviewBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setHash('');
    setTotpError('');
    try {
      if (requireTotp) {
        try {
          await verifyTransfer2fa(totpCode, needTotpPassword ? totpPassword : '');
        } catch (err) {
          setTotpError(translateError(t, err.message) || t('error_totp_invalid'));
          setBusy(false);
          return;
        }
      }

      let txHash;
      if (asset === 'PLS') {
        txHash = await sendNative(signer, checksumTo, amount);
      } else {
        txHash = await sendToken(signer, selectedToken.address, checksumTo, amount, selectedToken.decimals);
      }
      setHash(txHash);
      notifyTransferSent({
        amount,
        symbol: asset,
        to: checksumTo,
        accountName: activeAccount?.name,
        hash: txHash,
      });
      setAmount('');
      setTo('');
      closeConfirm();
    } catch (e) {
      setConfirmUi({
        phase: 'blocked',
        preview: null,
        blocker: sendBlockerFromError(e, t),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card send-card">
        <div className="label">{t('send_asset')}</div>
        <div className="send-asset-select">
          <TokenIcon
            symbol={selectedAssetMeta?.symbol || asset}
            logo={selectedAssetMeta?.logo}
            logoData={selectedAssetMeta?.logoData}
            className="token-icon-sm"
          />
          <PopupSelect
            value={asset}
            onChange={setAsset}
            options={assetOptions}
            ariaLabel={t('send_asset')}
          />
        </div>

        <div className="label">{t('send_recipient')}</div>
        <input
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setFormAlert(null);
          }}
          placeholder={t('placeholder_address')}
          spellCheck={false}
        />

        <div className="label">{t('send_amount')}</div>
        <input
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setFormAlert(null);
          }}
          placeholder={t('placeholder_amount')}
        />

        {estCost && <p className="muted">{t('est_gas', { cost: Number(estCost).toFixed(6) })}</p>}

        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || reviewBusy}
          onClick={openConfirm}
        >
          {reviewBusy ? t('send_confirm_loading') : t('review_send')}
        </button>
        {hash && <p className="success">{t('sent_hash', { hash: hash.slice(0, 14) })}</p>}
      </div>

      <SwapErrorModal
        open={Boolean(formAlert)}
        blocker={formAlert}
        title={formAlert?.title}
        onClose={() => setFormAlert(null)}
      />

      <SendConfirmModal
        open={confirming}
        phase={confirmUi?.phase}
        preview={confirmUi?.preview}
        blocker={confirmUi?.blocker}
        fromAccountName={activeAccount?.name}
        to={checksumTo}
        amount={amount}
        asset={asset}
        selectedToken={selectedToken}
        busy={busy}
        requireTotp={requireTotp}
        needTotpPassword={needTotpPassword}
        totpCode={totpCode}
        totpPassword={totpPassword}
        totpError={totpError}
        onTotpCodeChange={(v) => {
          setTotpCode(v);
          setTotpError('');
        }}
        onTotpPasswordChange={(v) => {
          setTotpPassword(v);
          setTotpError('');
        }}
        onCancel={closeConfirm}
        onConfirm={submit}
      />
    </>
  );
}