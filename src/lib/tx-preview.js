import { Interface, formatEther, parseEther, parseUnits } from 'ethers';
import { ERC20_ABI, PULSECHAIN } from '../config/pulsechain.js';
import { validateSendFunds } from './send-validation.js';

const BLOCK_TIME_SEC = 3;
const EST_BLOCKS = 4;

export function formatPreviewPls(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  return n.toFixed(6);
}

export async function buildSendConfirmPreview({
  signer, to, amount, isNative, token,
}) {
  const validation = await validateSendFunds({
    signer, to, amount, isNative, token,
  });

  if (!validation.ok) {
    const err = new Error('SEND_BLOCKED');
    err.blocker = validation.blocker;
    throw err;
  }

  const { gasInfo, fromAddress, valueWei } = validation;
  const gasLimit = BigInt(gasInfo.gasLimit || 0);
  const gasPrice = BigInt(gasInfo.gasPrice || 0);
  const maxFeePerGas = gasInfo.maxFeePerGas ? BigInt(gasInfo.maxFeePerGas) : gasPrice;
  const networkFeeWei = gasLimit * gasPrice;
  const maxFeeWei = gasLimit * maxFeePerGas;

  const nonce = await signer.getNonce();

  let callData = null;
  let interactingWith = to;

  if (!isNative && token?.address) {
    interactingWith = token.address;
    const iface = new Interface(ERC20_ABI);
    const { getErc20Decimals } = await import('./token-decimals.js');
    const decimals = await getErc20Decimals(token.address, token.decimals ?? 18);
    const rawAmount = parseUnits(String(amount), decimals);
    callData = {
      function: 'transfer',
      params: [
        { kind: 'address', value: to },
        { kind: 'uint256', value: rawAmount.toString() },
      ],
      encoded: iface.encodeFunctionData('transfer', [to, rawAmount]),
    };
  }

  return {
    fromAddress,
    toAddress: to,
    amount: String(amount),
    symbol: isNative ? PULSECHAIN.nativeCurrency.symbol : token.symbol,
    tokenName: isNative ? PULSECHAIN.nativeCurrency.name : (token.name || token.symbol),
    tokenLogo: isNative ? 'pulsechain-logo.webp' : token.logo,
    tokenLogoData: token?.logoData,
    isNative,
    network: PULSECHAIN.name,
    networkSymbol: PULSECHAIN.nativeCurrency.symbol,
    interactingWith,
    nonce,
    gasLimit: gasInfo.gasLimit,
    gasPrice: gasInfo.gasPrice,
    maxFeePerGas: gasInfo.maxFeePerGas,
    networkFeePls: formatEther(networkFeeWei),
    maxFeePls: formatEther(maxFeeWei),
    estSeconds: BLOCK_TIME_SEC * EST_BLOCKS,
    callData,
    valuePls: isNative ? String(amount) : '0',
    valueWei: isNative ? valueWei.toString() : '0',
  };
}