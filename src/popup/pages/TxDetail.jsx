import { useEffect, useState } from 'react';
import { formatEther } from 'ethers';
import { useI18n } from '../../context/I18nContext.jsx';
import { shortenAddress } from '../../lib/wallet';
import {
  copyText,
  fetchTxDetail,
  formatGwei,
  formatTxDetailTime,
} from '../../lib/tx-detail';

function AddressRow({ label, address, contractName, t }) {
  if (!address) {
    return (
      <div className="tx-detail-row">
        <span className="tx-detail-label">{label}</span>
        <span className="tx-detail-value muted">{t('tx_detail_contract_creation')}</span>
      </div>
    );
  }

  return (
    <div className="tx-detail-row">
      <span className="tx-detail-label">{label}</span>
      <div className="tx-detail-value tx-detail-address">
        <span className="tx-detail-address-full">{address}</span>
        {contractName && <span className="tx-detail-badge">{contractName}</span>}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="tx-detail-row">
      <span className="tx-detail-label">{label}</span>
      <span className={`tx-detail-value${mono ? ' tx-detail-mono' : ''}`}>{value}</span>
    </div>
  );
}

function EmptyTab({ message }) {
  return <div className="card muted tx-detail-empty">{message}</div>;
}

export default function TxDetail({ hash, onBack }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('details');
  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const TABS = [
    ['details', t('tx_detail_tab_details')],
    ['tokens', t('tx_detail_tab_tokens')],
    ['internal', t('tx_detail_tab_internal')],
    ['logs', t('tx_detail_tab_logs')],
  ];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setTx(null);
    setTab('details');

    fetchTxDetail(hash)
      .then((data) => {
        if (!cancelled) setTx(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || t('tx_detail_load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hash, t]);

  const handleCopyHash = async () => {
    const ok = await copyText(hash);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (loading) {
    return <div className="card muted">{t('tx_detail_loading')}</div>;
  }

  if (error || !tx) {
    return (
      <>
        <button type="button" className="tx-detail-back" onClick={onBack}>
          {t('tx_detail_back')}
        </button>
        <div className="card">
          <p className="error">{error || t('tx_detail_not_found')}</p>
        </div>
      </>
    );
  }

  const failReason = tx.revertReason || tx.errorDescription;

  return (
    <div className="tx-detail-page">
      <button type="button" className="tx-detail-back" onClick={onBack}>
        {t('tx_detail_back')}
      </button>

      <div className="card tx-detail-header">
        <div className="row">
          <span className={`tx-detail-status tx-detail-status-${tx.status}`}>
            {tx.status === 'success' ? t('tx_detail_success') : t('tx_detail_failed')}
          </span>
          <button type="button" className="tx-detail-copy" onClick={handleCopyHash}>
            {copied ? t('tx_detail_copied') : t('tx_detail_copy_hash')}
          </button>
        </div>
        <div className="tx-detail-hash">{shortenAddress(tx.hash, 10)}</div>
        <div className="muted">{formatTxDetailTime(tx.timestamp)}</div>
        {failReason && <div className="error tx-detail-error">{failReason}</div>}
      </div>

      <div className="tx-detail-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'tokens' && tx.transfers.length > 0 && (
              <span className="tx-detail-tab-count">{tx.transfers.length}</span>
            )}
            {id === 'internal' && tx.internalTxs.length > 0 && (
              <span className="tx-detail-tab-count">{tx.internalTxs.length}</span>
            )}
            {id === 'logs' && tx.logs.length > 0 && (
              <span className="tx-detail-tab-count">{tx.logs.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="card tx-detail-panel">
          <DetailRow label={t('tx_detail_block')} value={tx.blockNumber || '—'} />
          <DetailRow label={t('tx_detail_confirmations')} value={tx.confirmations ?? '—'} />
          <DetailRow label={t('tx_detail_value')} value={`${Number(tx.value).toFixed(6)} PLS`} />
          <DetailRow label={t('tx_detail_tx_fee')} value={`${Number(tx.txFee).toFixed(6)} PLS`} />
          <DetailRow label={t('tx_detail_gas_used')} value={`${tx.gasUsed} / ${tx.gasLimit}`} />
          <DetailRow label={t('tx_detail_gas_price')} value={formatGwei(tx.gasPrice)} />
          {tx.maxFeePerGas && (
            <DetailRow label={t('tx_detail_max_fee')} value={formatGwei(tx.maxFeePerGas)} />
          )}
          {tx.maxPriorityFeePerGas && (
            <DetailRow label={t('tx_detail_priority_fee')} value={formatGwei(tx.maxPriorityFeePerGas)} />
          )}
          {tx.nonce && <DetailRow label={t('tx_detail_nonce')} value={tx.nonce} />}
          {tx.txType && <DetailRow label={t('tx_detail_type')} value={tx.txType} />}
          <AddressRow label={t('tx_detail_from')} address={tx.from} t={t} />
          <AddressRow
            label={t('tx_detail_to')}
            address={tx.to}
            contractName={tx.contractName}
            t={t}
          />
          {tx.input && tx.input !== '0x' && (
            <div className="tx-detail-input">
              <div className="tx-detail-label">{t('tx_detail_input_data')}</div>
              <pre className="tx-detail-input-data">{tx.input}</pre>
            </div>
          )}
        </div>
      )}

      {tab === 'tokens' && (
        tx.transfers.length === 0
          ? <EmptyTab message={t('tx_detail_no_tokens')} />
          : (
            <div className="tx-detail-list">
              {tx.transfers.map((transfer) => (
                  <div key={transfer.id} className="card tx-detail-item">
                    <div className="activity-title">
                      {transfer.amountLabel}
                      {' '}
                      {transfer.symbol}
                    </div>
                    <div className="muted">{transfer.tokenName}</div>
                    <div className="tx-detail-transfer-col">
                      <div>
                        <span className="tx-detail-label">{t('tx_detail_from')}</span>
                        <span className="tx-detail-address-full">{transfer.from}</span>
                      </div>
                      <div>
                        <span className="tx-detail-label">{t('tx_detail_to')}</span>
                        <span className="tx-detail-address-full">{transfer.to}</span>
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          )
      )}

      {tab === 'internal' && (
        tx.internalTxs.length === 0
          ? <EmptyTab message={t('tx_detail_no_internal')} />
          : (
            <div className="tx-detail-list">
              {tx.internalTxs.map((item, index) => (
                <div key={`${item.transactionHash}-${item.index ?? index}`} className="card tx-detail-item">
                  <div className="activity-title">
                    {Number(formatEther(item.value || '0')).toFixed(6)}
                    {' '}
                    PLS
                  </div>
                  <div className="muted">
                    {item.type || item.callType || 'call'}
                    {item.isError === '1' && t('tx_detail_internal_failed')}
                  </div>
                  <div className="tx-detail-transfer-col">
                    <div>
                      <span className="tx-detail-label">{t('tx_detail_from')}</span>
                      <span className="tx-detail-address-full">{item.from}</span>
                    </div>
                    <div>
                      <span className="tx-detail-label">{t('tx_detail_to')}</span>
                      <span className="tx-detail-address-full">{item.to}</span>
                    </div>
                  </div>
                  {item.gasUsed && (
                    <div className="muted">
                      {t('tx_detail_gas_used_row', { amount: item.gasUsed })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
      )}

      {tab === 'logs' && (
        tx.logs.length === 0
          ? <EmptyTab message={t('tx_detail_no_logs')} />
          : (
            <div className="tx-detail-list">
              {tx.logs.map((log, index) => (
                <div key={`${log.logIndex ?? index}-${log.address}`} className="card tx-detail-item">
                  <div className="activity-title">
                    {t('tx_detail_log', { index: log.logIndex ?? index })}
                  </div>
                  <div className="muted">{shortenAddress(log.address, 6)}</div>
                  {(log.topics || []).map((topic, topicIndex) => (
                    <div key={topic} className="tx-detail-log-topic">
                      <span className="tx-detail-label">
                        {t('tx_detail_topic', { index: topicIndex })}
                      </span>
                      <span className="tx-detail-mono">{shortenAddress(topic, 8)}</span>
                    </div>
                  ))}
                  {log.data && log.data !== '0x' && (
                    <div className="tx-detail-log-topic">
                      <span className="tx-detail-label">{t('tx_detail_data')}</span>
                      <span className="tx-detail-mono">{shortenAddress(log.data, 8)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
      )}

    </div>
  );
}