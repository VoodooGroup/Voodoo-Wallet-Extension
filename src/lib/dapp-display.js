import { formatEther, isHexString } from 'ethers';
import { shortenAddress } from './wallet';

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

export function describeDappRequest(method, params = [], t = (key) => key) {
  switch (method) {
    case 'eth_sendTransaction': {
      const tx = params[0] || {};
      const to = tx.to || t('dapp_contract_deploy');
      const value = tx.value ? formatEther(tx.value) : '0';
      const data = (tx.data || '').toLowerCase();
      const hasData = data && data !== '0x' && data.length > 2;
      // ERC-20 approve(address,uint256) selector = 0x095ea7b3
      const isErc20Approve = hasData && data.startsWith('0x095ea7b3');
      // stake(uint256,uint8,uint256) and similar — show generic contract if data present
      let title = hasData ? t('dapp_tx_contract') : t('dapp_tx_send');
      if (isErc20Approve) title = t('dapp_tx_approve') || 'Token approve';
      return {
        title,
        lines: [
          { label: t('dapp_to'), value: shortenAddress(to, 8) || to },
          { label: t('dapp_amount'), value: `${Number(value).toFixed(6)} PLS` },
          ...(isErc20Approve
            ? [{ label: t('dapp_action') || 'Action', value: t('dapp_approve_vdo') || 'Approve VDO spending' }]
            : []),
          ...(hasData && !isErc20Approve
            ? [{ label: t('dapp_data'), value: `${tx.data.slice(0, 18)}…` }]
            : []),
        ],
        warning: hasData ? t('dapp_review_contract') : null,
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
        title: t('dapp_sign_message'),
        lines: [{ label: t('dapp_message'), value: preview }],
        warning: null,
      };
    }
    case 'eth_signTypedData':
    case 'eth_signTypedData_v4': {
      const raw = params[1];
      const typed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const domain = typed?.domain?.name || typed?.domain?.verifyingContract || t('dapp_unknown_app');
      const primary = typed?.primaryType || t('dapp_typed_data');
      return {
        title: t('dapp_sign_typed'),
        lines: [
          { label: t('dapp_domain'), value: domain },
          { label: t('dapp_type'), value: primary },
        ],
        warning: t('dapp_trust_warning'),
      };
    }
    default:
      return {
        title: method,
        lines: [],
        warning: t('dapp_unknown_request'),
      };
  }
}