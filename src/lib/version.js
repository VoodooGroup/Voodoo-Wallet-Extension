import manifest from '../../extension.manifest.json';

export function getAppVersion() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
    return chrome.runtime.getManifest().version;
  }
  return manifest.version;
}