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

export function describeDappRequest(method, params = []) {
  switch (method) {
    case 'eth_sendTransaction': {
      const tx = params[0] || {};
      const to = tx.to || '(contract deploy)';
      const value = tx.value ? formatEther(tx.value) : '0';
      const hasData = tx.data && tx.data !== '0x' && tx.data.length > 2;
      return {
        title: hasData ? 'Contract interaction' : 'Send transaction',
        lines: [
          { label: 'To', value: shortenAddress(to, 8) || to },
          { label: 'Amount', value: `${Number(value).toFixed(6)} PLS` },
          ...(hasData ? [{ label: 'Data', value: `${tx.data.slice(0, 18)}…` }] : []),
        ],
        warning: hasData ? 'Review carefully — smart contract call' : null,
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
        title: 'Sign message',
        lines: [{ label: 'Message', value: preview }],
        warning: null,
      };
    }
    case 'eth_signTypedData':
    case 'eth_signTypedData_v4': {
      const raw = params[1];
      const typed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const domain = typed?.domain?.name || typed?.domain?.verifyingContract || 'Unknown app';
      const primary = typed?.primaryType || 'Typed data';
      return {
        title: 'Sign typed data',
        lines: [
          { label: 'Domain', value: domain },
          { label: 'Type', value: primary },
        ],
        warning: 'Only sign if you trust this site',
      };
    }
    default:
      return {
        title: method,
        lines: [],
        warning: 'Unknown request type',
      };
  }
}