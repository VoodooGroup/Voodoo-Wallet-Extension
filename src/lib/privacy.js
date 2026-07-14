import { PRIVACY_POLICY_PUBLIC_URL } from '../config/store.js';

export function getPrivacyPolicyUrl() {
  if (PRIVACY_POLICY_PUBLIC_URL) {
    return PRIVACY_POLICY_PUBLIC_URL;
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL('public/privacy-policy-web-extension.html');
  }
  return null;
}

export function openPrivacyPolicy() {
  const url = getPrivacyPolicyUrl();
  if (!url) return;
  chrome.tabs.create({ url });
}