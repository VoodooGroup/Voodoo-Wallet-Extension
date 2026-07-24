import { formatEther, formatUnits, isHexString, id as ethersId } from 'ethers';
import { shortenAddress } from './wallet';
import { STAKING_POOLS } from '../config/staking.js';

function decodeMessage(message) {
  if (typeof message !== 'string') return String(message);
  if (isHexString(message)) {
    try {
      const hex = message.slice(2);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      }
      const text = new TextDecoder().decode(bytes);
      if (/^[\x20-\x7E\n\r\t]+$/.test(text)) return text;
      return message;
    } catch {
      return message;
    }
  }
  return message;
}

function selectorOf(sig) {
  try {
    return ethersId(sig).slice(0, 10).toLowerCase();
  } catch {
    return '';
  }
}

const SEL_APPROVE = '0x095ea7b3';
const SEL_STAKE = selectorOf('stake(uint256,uint8,uint256)');
const SEL_UNSTAKE = selectorOf('unstake(uint256)');

/** Read ABI-encoded uint256 word n (0-based) from calldata hex */
function readWordBigInt(data, wordIndex) {
  try {
    const hex = String(data || '').toLowerCase().replace(/^0x/, '');
    // selector = 4 bytes = 8 hex chars
    const start = 8 + wordIndex * 64;
    const slice = hex.slice(start, start + 64);
    if (slice.length < 64) return null;
    return BigInt(`0x${slice}`);
  } catch {
    return null;
  }
}

function formatVdoAmount(wei) {
  try {
    const n = Number(formatUnits(wei, 18));
    if (!Number.isFinite(n)) return formatUnits(wei, 18);
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return String(wei);
  }
}

function poolLabelFromParams(rewardType, durationSec) {
  const match = STAKING_POOLS.find(
    (p) => Number(p.rewardToken) === Number(rewardType)
      && Number(p.duration) === Number(durationSec),
  );
  if (match) {
    return `${match.rewardLabel} · ${match.lockupDays} days`;
  }
  const days = Math.round(Number(durationSec) / 86400);
  const reward = Number(rewardType) === 1 ? 'POISON' : 'MAGIC';
  return `${reward} · ${days}d lock`;
}

/**
 * @returns {{
 *   title: string,
 *   lead?: string,
 *   lines: { label: string, value: string, emphasize?: boolean }[],
 *   warning?: string|null,
 *   friendly?: boolean,
 *   kind?: 'approve'|'stake'|'unstake'|'tx'|'sign',
 *   primaryAction?: string,
 *   gasHint?: 'approve'|'stake'|'unstake'|'tx',
 * }}
 */
export function describeDappRequest(method, params = [], t = (key) => key) {
  switch (method) {
    case 'eth_sendTransaction': {
      const tx = params[0] || {};
      const to = tx.to || t('dapp_contract_deploy');
      const value = tx.value ? formatEther(tx.value) : '0';
      const data = (tx.data || '').toLowerCase();
      const hasData = data && data !== '0x' && data.length > 2;
      const sel = hasData ? data.slice(0, 10) : '';
      const gasLimit = tx.gasLimit ?? tx.gas;

      if (sel === SEL_APPROVE) {
        return {
          kind: 'approve',
          // Full detail card like before: Action / Allow / Est. gas + Approve button
          title: t('approve') || 'Approve',
          lead: '',
          lines: [
            {
              label: t('dapp_action') || 'Action',
              value: t('dapp_token_approval') || 'Token Approval',
            },
            {
              label: t('dapp_allow') || 'Allow',
              value: 'VDO',
            },
          ],
          warning: '',
          friendly: true,
          primaryAction: t('approve') || 'Approve',
          gasHint: 'approve',
          // Never pass inflated dApp gas into the fee display
          gasLimit: null,
          hideSite: true,
          subtitle: '',
        };
      }

      if (sel === SEL_STAKE) {
        const amountWei = readWordBigInt(data, 0);
        const rewardType = readWordBigInt(data, 1);
        const duration = readWordBigInt(data, 2);
        const amountLabel = amountWei != null
          ? `${formatVdoAmount(amountWei)} VDO`
          : '—';
        const poolLabel = (rewardType != null && duration != null)
          ? poolLabelFromParams(rewardType, duration)
          : '—';

        return {
          kind: 'stake',
          // Minimal: amount hero + pool + gas
          title: t('dapp_confirm_stake') || t('dapp_tx_stake') || 'Stake',
          lead: '',
          lines: [
            {
              label: t('dapp_amount') || 'Amount',
              value: amountLabel,
              emphasize: true,
            },
            {
              label: t('dapp_pool') || 'Pool',
              value: poolLabel,
            },
          ],
          warning: '',
          friendly: true,
          primaryAction: t('confirm') || 'Confirm',
          gasHint: 'stake',
          gasLimit,
          hideSite: true,
        };
      }

      if (sel === SEL_UNSTAKE) {
        const index = readWordBigInt(data, 0);
        return {
          kind: 'unstake',
          title: t('dapp_tx_unstake') || 'Unstake',
          lead: '',
          lines: [
            {
              label: t('dapp_stake_index') || 'Stake #',
              value: index != null ? String(index) : '—',
            },
          ],
          warning: '',
          friendly: true,
          primaryAction: t('confirm') || 'Confirm',
          gasHint: 'unstake',
          gasLimit,
          hideSite: true,
        };
      }

      return {
        kind: 'tx',
        title: hasData ? t('dapp_tx_contract') : t('dapp_tx_send'),
        lead: t('dapp_confirm_request'),
        lines: [
          { label: t('dapp_to'), value: shortenAddress(to, 8) || to },
          { label: t('dapp_amount'), value: `${Number(value).toFixed(6)} PLS` },
          ...(hasData
            ? [{ label: t('dapp_data'), value: `${tx.data.slice(0, 18)}…` }]
            : []),
        ],
        warning: hasData ? t('dapp_review_contract') : null,
        friendly: !hasData,
        primaryAction: t('confirm') || t('approve'),
        gasHint: 'tx',
        gasLimit,
      };
    }
    case 'personal_sign': {
      let message = params[0];
      if (typeof params[0] === 'string' && params[0].length === 42 && params[1]) {
        message = params[1];
      }
      const decoded = decodeMessage(message);
      const preview = decoded.length > 280 ? `${decoded.slice(0, 280)}…` : decoded;
      return {
        kind: 'sign',
        title: t('dapp_sign_message'),
        lead: t('dapp_confirm_request'),
        lines: [{ label: t('dapp_message'), value: preview }],
        warning: null,
        primaryAction: t('approve'),
      };
    }
    case 'eth_signTypedData':
    case 'eth_signTypedData_v4': {
      const raw = params[1];
      const typed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const domain = typed?.domain?.name || typed?.domain?.verifyingContract || t('dapp_unknown_app');
      const primary = typed?.primaryType || t('dapp_typed_data');
      return {
        kind: 'sign',
        title: t('dapp_sign_typed'),
        lead: t('dapp_confirm_request'),
        lines: [
          { label: t('dapp_domain'), value: domain },
          { label: t('dapp_type'), value: primary },
        ],
        warning: t('dapp_trust_warning'),
        primaryAction: t('approve'),
      };
    }
    default:
      return {
        kind: 'tx',
        title: method,
        lead: t('dapp_confirm_request'),
        lines: [],
        warning: t('dapp_unknown_request'),
        primaryAction: t('approve'),
      };
  }
}
