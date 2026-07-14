import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import {
  approveVdo,
  checkVdoApproval,
  fetchPoolApys,
  fetchUserStakes,
  filterStakesForPool,
  formatTimeLeft,
  stakeVdo,
  unstakeVdo,
} from '../../lib/staking';
import { STAKING_ADDRESS, STAKING_POOLS } from '../../config/staking';
import { TOKEN_LOGOS } from '../../config/pulsechain';
import TokenIcon from '../../components/TokenIcon';
import { formatTxError } from '../../lib/gas';

function PoolCard({ pool, approved, signer, address, vdoBalance, onDone }) {
  const [tab, setTab] = useState('stake');
  const [amount, setAmount] = useState('');
  const [stakes, setStakes] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState('');
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadStakes = useCallback(async () => {
    if (!address) return;
    const all = await fetchUserStakes(address);
    setStakes(filterStakesForPool(all, pool));
  }, [address, pool]);

  useEffect(() => {
    if (tab === 'unstake') loadStakes();
  }, [tab, loadStakes]);

  useEffect(() => {
    if (tab !== 'unstake' || !selectedIdx) return undefined;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [tab, selectedIdx]);

  const selectedStake = stakes.find((s) => String(s.index) === selectedIdx);
  const unlockLabel = selectedStake
    ? formatTimeLeft(selectedStake.unlockAt - now)
    : '—';

  const handleStake = async () => {
    if (!signer || !amount || Number(amount) <= 0) return;
    setBusy(true);
    setErr('');
    try {
      await stakeVdo(signer, amount, pool.rewardToken, pool.duration);
      setAmount('');
      onDone?.();
    } catch (e) {
      setErr(formatTxError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUnstake = async () => {
    if (!signer || selectedIdx === '') return;
    setBusy(true);
    setErr('');
    try {
      await unstakeVdo(signer, Number(selectedIdx));
      setSelectedIdx('');
      await loadStakes();
      onDone?.();
    } catch (e) {
      setErr(formatTxError(e));
    } finally {
      setBusy(false);
    }
  };

  const useMax = () => {
    if (vdoBalance > 0) setAmount(String(vdoBalance));
  };

  return (
    <div className="stake-pool-card">
      <div className="stake-pool-header">
        <div className="stake-pool-flow">
          <TokenIcon symbol="VDO" logo={TOKEN_LOGOS.VDO} className="token-icon-xl" />
          <span className="stake-flow-arrow">→</span>
          <TokenIcon symbol={pool.rewardLabel} logo={TOKEN_LOGOS[pool.rewardLabel]} className="token-icon-xxl" />
        </div>
        <div className="stake-pool-meta">
          <div className="stake-pool-lock">{pool.lockupDays} day lock</div>
          <div className="stake-pool-reward">Earn {pool.rewardLabel}</div>
        </div>
        <div className="stake-apy-badge">
          <span className="stake-apy-value">{pool.apy ?? '—'}%</span>
          <span className="stake-apy-label">APY</span>
        </div>
      </div>

      <div className="stake-tabs">
        <button type="button" className={tab === 'stake' ? 'active' : ''} onClick={() => setTab('stake')}>Stake</button>
        <button type="button" className={tab === 'unstake' ? 'active' : ''} onClick={() => { setTab('unstake'); setSelectedIdx(''); }}>Unstake</button>
      </div>

      {tab === 'stake' ? (
        <div className="stake-panel">
          <div className="row">
            <label className="label" style={{ margin: 0 }}>Amount to stake</label>
            <button type="button" className="stake-max-btn" onClick={useMax}>MAX</button>
          </div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
          <p className="muted stake-hint">Available: {vdoBalance.toFixed(4)} VDO</p>
          <button type="button" className="btn btn-primary" disabled={busy || !approved} onClick={handleStake}>
            {busy ? 'Staking…' : 'Stake VDO'}
          </button>
          {!approved && <p className="muted stake-hint">Approve VDO below before staking</p>}
        </div>
      ) : (
        <div className="stake-panel">
          {stakes.length === 0 ? (
            <p className="muted stake-empty">No active stakes in this pool yet</p>
          ) : (
            <div className="stake-positions">
              {stakes.map((s) => {
                const left = formatTimeLeft(s.unlockAt - now);
                const active = selectedIdx === String(s.index);
                return (
                  <button
                    key={s.index}
                    type="button"
                    className={`stake-position${active ? ' active' : ''}`}
                    onClick={() => setSelectedIdx(String(s.index))}
                  >
                    <div className="stake-position-top">
                      <span className="stake-position-amount">{Number(s.amount).toFixed(2)} VDO</span>
                      <span className="stake-position-id">#{s.index}</span>
                    </div>
                    <span className="stake-position-time">{left}</span>
                  </button>
                );
              })}
            </div>
          )}
          {selectedStake && (
            <div className="stake-unlock-banner">
              <span className="label">Unlock in</span>
              <span className="stake-unlock-time">{unlockLabel}</span>
            </div>
          )}
          <button type="button" className="btn btn-secondary" disabled={busy || !selectedIdx} onClick={handleUnstake}>
            {busy ? 'Unstaking…' : 'Unstake selected'}
          </button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function PoolSection({ title, pools, ...cardProps }) {
  if (!pools.length) return null;
  return (
    <section className="stake-section">
      <div className="stake-section-head">
        <h2 className="stake-section-title">{title}</h2>
      </div>
      {pools.map((pool) => (
        <PoolCard key={pool.id} pool={pool} {...cardProps} />
      ))}
    </section>
  );
}

export default function Stake() {
  const { signer, address, plsBalance, tokens, refresh } = useWallet();
  const [pools, setPools] = useState(STAKING_POOLS);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState('');

  const pls = Number(plsBalance || 0);
  const lowGas = pls < 0.001;
  const vdoToken = tokens.find((t) => t.symbol === 'VDO');
  const vdoBalance = vdoToken ? Number(vdoToken.balance) : 0;

  const load = useCallback(async () => {
    if (!address) return;
    const [apys, ok] = await Promise.all([
      fetchPoolApys(),
      checkVdoApproval(address, signer),
    ]);
    setPools(apys);
    setApproved(ok);
  }, [address, signer]);

  useEffect(() => { load(); }, [load]);

  const approve = async () => {
    setApproving(true);
    setApproveErr('');
    try {
      await approveVdo(signer);
      setApproved(true);
      await refresh();
    } catch (e) {
      setApproveErr(formatTxError(e));
    } finally {
      setApproving(false);
    }
  };

  const magicPools = pools.filter((p) => p.rewardLabel === 'MAGIC');
  const poisonPools = pools.filter((p) => p.rewardLabel === 'POISON');
  const cardProps = {
    approved,
    signer,
    address,
    vdoBalance,
    onDone: () => { load(); refresh(); },
  };

  return (
    <div className="stake-page">
      <div className="stake-hero card">
        <div className="stake-hero-icons">
          <TokenIcon symbol="VDO" logo={TOKEN_LOGOS.VDO} className="token-icon-xl" />
          <span className="stake-hero-arrow">→</span>
          <div className="stake-hero-rewards">
            <TokenIcon symbol="MAGIC" logo={TOKEN_LOGOS.MAGIC} className="token-icon-lg" />
            <TokenIcon symbol="POISON" logo={TOKEN_LOGOS.POISON} className="token-icon-lg" />
          </div>
        </div>
        <h2 className="stake-hero-title">Stake VDO</h2>
        <p className="muted stake-hero-desc">Lock VDO to earn MAGIC or POISON rewards</p>
      </div>

      <div className="card stake-setup-card">
        <div className="stake-setup-row">
          <div className="stake-setup-item">
            <TokenIcon symbol="PLS" logo={TOKEN_LOGOS.PLS} className="token-icon-md" />
            <div>
              <div className="label">Gas balance</div>
              <div className="value">{pls.toFixed(4)} PLS</div>
            </div>
          </div>
          <div className="stake-setup-item">
            <TokenIcon symbol="VDO" logo={TOKEN_LOGOS.VDO} className="token-icon-md" />
            <div>
              <div className="label">Your VDO</div>
              <div className="value">{vdoBalance.toFixed(4)}</div>
            </div>
          </div>
        </div>
        {lowGas && (
          <p className="error stake-gas-warn">
            Low PLS — add Pulse for gas fees on approve, stake &amp; unstake
          </p>
        )}
        <div className="stake-approve-row">
          {approved ? (
            <p className="success stake-approved">✓ VDO approved for staking</p>
          ) : (
            <button type="button" className="btn btn-primary" disabled={approving || lowGas} onClick={approve}>
              {approving ? 'Approving…' : 'Approve VDO'}
            </button>
          )}
        </div>
        {approveErr && <p className="error">{approveErr}</p>}
        <p className="muted stake-contract">Contract: {STAKING_ADDRESS.slice(0, 6)}…{STAKING_ADDRESS.slice(-4)}</p>
      </div>

      <PoolSection title="MAGIC pools" pools={magicPools} {...cardProps} />
      <PoolSection title="POISON pools" pools={poisonPools} {...cardProps} />
    </div>
  );
}