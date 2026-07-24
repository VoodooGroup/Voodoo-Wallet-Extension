import { Contract, formatEther, formatUnits, parseEther, parseUnits } from 'ethers';
import { ERC20_ABI, PULSECHAIN } from '../config/pulsechain.js';
import { estimateGasSend, getProvider } from './chain.js';
import { blockerFromError } from './send-blocker.js';

const MIN_GAS_BUFFER = 500_000_000_000_000n;

function fmtPls(wei) {
  return Number(formatEther(wei)).toFixed(6);
}

export { blockerFromError, parseSendBlocker } from './send-blocker.js';

export async function validateSendFunds({
  signer, to, amount, isNative, token,
}) {
  const fromAddress = await signer.getAddress();
  const plsWei = await getProvider().getBalance(fromAddress);
  const valueWei = isNative ? parseEther(String(amount)) : 0n;

  if (!isNative && token?.address) {
    const { getErc20Decimals } = await import('./token-decimals.js');
    const contract = new Contract(token.address, ERC20_ABI, getProvider());
    const [rawBal, decimals] = await Promise.all([
      contract.balanceOf(fromAddress),
      getErc20Decimals(token.address, token.decimals ?? 18),
    ]);
    const needWei = parseUnits(String(amount), decimals);
    if (rawBal < needWei) {
      const tokenBal = formatUnits(rawBal, decimals);
      return {
        ok: false,
        blocker: {
          reason: 'insufficient_token',
          tokenSymbol: token.symbol,
          tokenBalance: Number(tokenBal).toFixed(6),
          tokenRequired: String(amount),
          plsBalance: fmtPls(plsWei),
        },
      };
    }
  }

  if (isNative && plsWei < valueWei) {
    return {
      ok: false,
        blocker: {
          reason: 'insufficient_pls',
          tokenSymbol: 'PLS',
          plsBalance: fmtPls(plsWei),
          plsRequired: fmtPls(valueWei),
          shortfallPls: fmtPls(valueWei - plsWei),
          includesGas: false,
          sendAmount: String(amount),
        },
    };
  }

  let gasInfo;
  try {
    gasInfo = await estimateGasSend({
      signer,
      to,
      amount,
      isNative,
      tokenAddress: token?.address,
      decimals: token?.decimals ?? 18,
    });
  } catch (error) {
    return { ok: false, blocker: blockerFromError(error) };
  }

  const gasLimit = BigInt(gasInfo.gasLimit || 0);
  const gasPrice = BigInt(gasInfo.gasPrice || 0);
  const gasWei = gasLimit * gasPrice;
  const totalPlsNeeded = isNative ? valueWei + gasWei + MIN_GAS_BUFFER : gasWei + MIN_GAS_BUFFER;

  if (plsWei < totalPlsNeeded) {
    return {
      ok: false,
      blocker: {
        reason: isNative ? 'insufficient_pls' : 'insufficient_gas',
        tokenSymbol: 'PLS',
        plsBalance: fmtPls(plsWei),
        plsRequired: fmtPls(totalPlsNeeded),
        shortfallPls: fmtPls(totalPlsNeeded - plsWei),
        gasEstimate: fmtPls(gasWei),
        includesGas: true,
        sendAmount: isNative ? String(amount) : null,
        transferSymbol: isNative ? PULSECHAIN.nativeCurrency.symbol : token?.symbol,
      },
    };
  }

  return { ok: true, gasInfo, plsWei, valueWei, fromAddress };
}