/** Map WalletContext / lib error keys (error_*) through i18n. */
export function translateError(t, message) {
  if (typeof message === 'string' && message.startsWith('error_')) {
    const translated = t(message);
    return translated !== message ? translated : message;
  }
  return message || '';
}