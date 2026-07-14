import { Contract, parseUnits, formatUnits, MaxUint256 } from 'ethers';
import { getProvider } from './chain';
import { runWithGasCheck } from './gas';
import {
  STAKING_ADDRESS,
  STAKING_ABI,
  STAKING_POOLS,
  VDO_ADDRESS,
} from '../config/staking';
import { ERC20_ABI } from '../config/pulsechain';

export function getStakingContract(signerOrProvider) {
  return new Contract(STAKING_ADDRESS, STAKING_ABI, signerOrProvider || getProvider());
}

export function getVdoContract(signerOrProvider) {
  return new Contract(VDO_ADDRESS, ERC20_ABI, signerOrProvider || getProvider());
}

export async function fetchPoolApys() {
  const contract = getStakingContract();
  const pools = await Promise.all(
    STAKING_POOLS.map(async (pool) => {
      try {
        const rate = await contract.rewardRates(pool.rewardToken, pool.duration);
        return { ...pool, apy: Number(rate) };
      } catch {
        return { ...pool, apy: null };
      }
    }),
  );
  return pools;
}

export async function checkVdoApproval(owner, signer) {
  const vdo = getVdoContract(signer || getProvider());
  const allowance = await vdo.allowance(owner, STAKING_ADDRESS);
  return allowance > 0n;
}

export async function estimateApproveGas(signer) {
  const vdo = getVdoContract(signer);
  const gas = await vdo.approve.estimateGas(STAKING_ADDRESS, MaxUint256);
  return gas;
}

export async function approveVdo(signer) {
  const vdo = getVdoContract(signer);
  return runWithGasCheck(
    signer,
    () => vdo.approve.estimateGas(STAKING_ADDRESS, MaxUint256),
    async () => {
      const tx = await vdo.approve(STAKING_ADDRESS, MaxUint256);
      await tx.wait();
      return tx.hash;
    },
  );
}

export async function stakeVdo(signer, amount, rewardToken, duration) {
  const contract = getStakingContract(signer);
  const parsed = parseUnits(String(amount), 18);
  return runWithGasCheck(
    signer,
    () => contract.stake.estimateGas(parsed, rewardToken, duration),
    async () => {
      const tx = await contract.stake(parsed, rewardToken, duration);
      await tx.wait();
      return tx.hash;
    },
  );
}

export async function unstakeVdo(signer, stakingIndex) {
  const contract = getStakingContract(signer);
  return runWithGasCheck(
    signer,
    () => contract.unstake.estimateGas(stakingIndex),
    async () => {
      const tx = await contract.unstake(stakingIndex);
      await tx.wait();
      return tx.hash;
    },
  );
}

export async function fetchUserStakes(userAddress) {
  const contract = getStakingContract();
  const stakes = await contract.getAllUserStakings(userAddress);
  return stakes.map((s, idx) => ({
    index: idx,
    amount: formatUnits(s.amount, 18),
    stakeTime: Number(s.stakeTime),
    lockDuration: Number(s.lockDuration),
    rewardType: Number(s.rewardType),
    isStaked: s.isStaked,
    unlockAt: Number(s.stakeTime) + Number(s.lockDuration),
  }));
}

export function filterStakesForPool(stakes, pool) {
  return stakes.filter(
    (s) => s.isStaked && s.rewardType === pool.rewardToken && s.lockDuration === pool.duration,
  );
}

export function formatTimeLeft(seconds) {
  if (seconds <= 0) return 'Ready';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}