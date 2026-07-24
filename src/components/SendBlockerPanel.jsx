import { useI18n } from '../context/I18nContext.jsx';
import TokenIcon from './TokenIcon';

function BlockerRow({ label, value, highlight }) {
  return (
    <div className={`send-blocker-row${highlight ? ' send-blocker-row-warn' : ''}`}>
      <span className="send-blocker-row-label">{label}</span>
      <span className="send-blocker-row-value">{value}</span>
    </div>
  );
}

export default function SendBlockerPanel({ blocker }) {
  const { t } = useI18n();
  if (!blocker) return null;

  const { reason } = blocker;

  let headline = blocker.body || t('send_blocked_insufficient_pls_body');
  if (reason === 'insufficient_token') {
    headline = t('send_blocked_insufficient_token_body', {
      symbol: blocker.tokenSymbol,
    });
  } else if (reason === 'insufficient_gas') {
    headline = t('send_blocked_insufficient_gas_body');
  } else if (reason === 'insufficient_pls' && !blocker.body) {
    headline = blocker.includesGas
      ? t('send_blocked_insufficient_pls_with_gas_body')
      : t('send_blocked_insufficient_pls_body');
  }

  return (
    <div className="send-blocker-panel" role="alert">
      <div className="send-blocker-icon" aria-hidden="true">!</div>
      <div className="send-blocker-content">
        <div className="send-blocker-headline">{headline}</div>

        {reason === 'insufficient_token' && (
          <div className="send-blocker-breakdown">
            <BlockerRow
              label={t('send_blocked_your_balance', { symbol: blocker.tokenSymbol })}
              value={`${blocker.tokenBalance} ${blocker.tokenSymbol}`}
            />
            <BlockerRow
              label={t('send_blocked_trying_to_send')}
              value={`${blocker.tokenRequired} ${blocker.tokenSymbol}`}
              highlight
            />
            <BlockerRow
              label={t('send_blocked_pls_for_gas')}
              value={`${blocker.plsBalance} PLS`}
            />
          </div>
        )}

        {(reason === 'insufficient_pls' || reason === 'insufficient_gas') && blocker.plsBalance != null && (
          <div className="send-blocker-breakdown">
            <BlockerRow
              label={t('send_blocked_your_balance', { symbol: 'PLS' })}
              value={`${blocker.plsBalance} PLS`}
            />
            {blocker.sendAmount && (
              <BlockerRow
                label={t('send_blocked_trying_to_send')}
                value={`${blocker.sendAmount} PLS`}
              />
            )}
            {blocker.gasEstimate && (
              <BlockerRow
                label={t('send_blocked_gas_needed')}
                value={`~${blocker.gasEstimate} PLS`}
              />
            )}
            {blocker.plsRequired && (
              <BlockerRow
                label={t('send_blocked_total_needed')}
                value={`~${blocker.plsRequired} PLS`}
                highlight
              />
            )}
            {blocker.shortfallPls && (
              <BlockerRow
                label={t('send_blocked_shortfall')}
                value={`${blocker.shortfallPls} PLS`}
                highlight
              />
            )}
          </div>
        )}

        {blocker.hint && (
          <p className="send-blocker-hint">{blocker.hint}</p>
        )}

        {!blocker.hint && (
          <p className="send-blocker-hint">
            {reason === 'insufficient_token'
              ? t('send_blocked_hint_token', { symbol: blocker.tokenSymbol })
              : t('send_blocked_hint_pls')}
          </p>
        )}
      </div>
      {reason !== 'generic' && (
        <div className="send-blocker-token-icon">
          <TokenIcon symbol={blocker.tokenSymbol || 'PLS'} />
        </div>
      )}
    </div>
  );
}