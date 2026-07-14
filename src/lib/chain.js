import {
  JsonRpcProvider, Contract, formatEther, formatUnits, parseEther, parseUnits,
} from 'ethers';
import { PULSECHAIN, DEFAULT_TOKENS, ERC20_ABI } from '../config/pulsechain';
let provider;

export function getProvider() {
  if (!provider) {
    const urls = PULSECHAIN.rpcUrls?.length ? PULSECHAIN.rpcUrls : [PULSECHAIN.rpcUrl];
    provider = new JsonRpcProvider(urls[0], PULSECHAIN.id);
  }
  return provider;
}

export async function getPlsBalance(address) {
  const bal = await getProvider().getBalance(address);
  return formatEther(bal);
}

export async function getTokenBalance(tokenAddress, walletAddress) {
  const contract = new Contract(tokenAddress, ERC20_ABI, getProvider());
  const [raw, decimals, symbol, name] = await Promise.all([
    contract.balanceOf(walletAddress),
    contract.decimals(),
    contract.symbol(),
    contract.name(),
  ]);
  return {
    address: tokenAddress,
    symbol,
    name,
    decimals: Number(decimals),
    balance: formatUnits(raw, decimals),
    raw: raw.toString(),
  };
}

export async function fetchAllBalances(address, customTokens = [], tokenLogos = {}) {
  const tokenList = DEFAULT_TOKENS.map((t) => ({ ...t }));

  customTokens.forEach((custom) => {
    const key = custom.address.toLowerCase();
    const existing = tokenList.find((x) => x.address.toLowerCase() === key);
    if (existing) {
      Object.assign(existing, {
        ...custom,
        logo: custom.logo || existing.logo,
        logoData: tokenLogos[key] || custom.logoData,
      });
    } else {
      tokenList.push({
        ...custom,
        logoData: tokenLogos[key] || custom.logoData,
      });
    }
  });

  const [pls, tokens] = await Promise.all([
    getPlsBalance(address),
    Promise.all(
      tokenList.map(async (t) => {
        const key = t.address.toLowerCase();
        const logoData = tokenLogos[key] || t.logoData;
        try {
          const bal = await getTokenBalance(t.address, address);
          return {
            ...bal,
            logo: t.logo,
            logoData,
            isCustom: t.isCustom || false,
          };
        } catch {
          return {
            ...t,
            balance: '0',
            raw: '0',
            logoData,
            isCustom: t.isCustom || false,
          };
        }
      }),
    ),
  ]);

  return { pls, tokens };
}

export async function estimateGasSend({ signer, to, amount, isNative, tokenAddress, decimals = 18 }) {
  if (isNative) {
    const tx = { to, value: parseEther(amount) };
    const gas = await signer.estimateGas(tx);
    const fee = await getProvider().getFeeData();
    return {
      gasLimit: gas.toString(),
      gasPrice: fee.gasPrice?.toString() || '0',
      maxFeePerGas: fee.maxFeePerGas?.toString() || null,
    };
  }
  const contract = new Contract(tokenAddress, ERC20_ABI, signer);
  const parsed = parseUnits(amount, decimals);
  const gas = await contract.transfer.estimateGas(to, parsed);
  const fee = await getProvider().getFeeData();
  return {
    gasLimit: gas.toString(),
    gasPrice: fee.gasPrice?.toString() || '0',
    maxFeePerGas: fee.maxFeePerGas?.toString() || null,
  };
}

export async function sendNative(signer, to, amount) {
  const tx = await signer.sendTransaction({ to, value: parseEther(amount) });
  await tx.wait();
  return tx.hash;
}

export async function sendToken(signer, tokenAddress, to, amount, decimals = 18) {
  const contract = new Contract(tokenAddress, ERC20_ABI, signer);
  const tx = await contract.transfer(to, parseUnits(amount, decimals));
  await tx.wait();
  return tx.hash;
}