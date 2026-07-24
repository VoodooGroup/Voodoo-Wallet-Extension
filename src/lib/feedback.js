/** Opens the default mail client to send tips/feedback to the Voodoo team. */
export const FEEDBACK_EMAIL = 'info@voodootoken.com';
export const CONTRIBUTE_GITHUB_URL = 'https://github.com/Voodoo-Token';

export function openFeedbackEmail() {
  const subject = encodeURIComponent('Voodoo Wallet — tips & ideas');
  const body = encodeURIComponent(
    'Hi Voodoo team,\n\nI have a tip / idea for the wallet:\n\n',
  );
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.location.href = url;
}

/** Opens the Voodoo Token GitHub org for contributions / source. */
export function openContributeGitHub() {
  const url = CONTRIBUTE_GITHUB_URL;
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
