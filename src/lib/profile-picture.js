/**
 * User profile picture (local only) — same model as Voodoo Android wallet.
 * Stored as data URL in chrome.storage.local; 1:1 square crop for circle display.
 */

export const PROFILE_PICTURE_KEY = 'voodoo_profile_picture_v1';

/** Output edge after 1:1 crop (matches Android ~256). */
const MAX_EDGE = 256;
const JPEG_QUALITY = 0.82;
const MAX_DATA_URL_CHARS = 350_000;

function storageOk() {
  return typeof chrome !== 'undefined' && chrome?.storage?.local;
}

/** @returns {Promise<string|null>} data URL or null */
export async function getProfilePicture() {
  if (!storageOk()) return null;
  try {
    const result = await chrome.storage.local.get(PROFILE_PICTURE_KEY);
    const url = result[PROFILE_PICTURE_KEY];
    if (typeof url === 'string' && url.startsWith('data:image/')) return url;
    return null;
  } catch {
    return null;
  }
}

/** @param {string|null} dataUrl */
export async function setProfilePicture(dataUrl) {
  if (!storageOk()) throw new Error('Storage unavailable');
  if (!dataUrl) {
    await chrome.storage.local.remove(PROFILE_PICTURE_KEY);
    return null;
  }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new Error('Invalid image');
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('Image too large');
  }
  await chrome.storage.local.set({ [PROFILE_PICTURE_KEY]: dataUrl });
  return dataUrl;
}

export async function clearProfilePicture() {
  return setProfilePicture(null);
}

/**
 * Read File/Blob, center-crop to 1:1, resize, return JPEG data URL.
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Please choose an image file'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Image must be under 8MB'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        try {
          const { width: iw, height: ih } = img;
          if (!iw || !ih) {
            reject(new Error('Invalid image dimensions'));
            return;
          }
          // Center square crop (1:1) — same presentation as Android circle avatar
          const side = Math.min(iw, ih);
          const sx = Math.floor((iw - side) / 2);
          const sy = Math.floor((ih - side) / 2);
          const out = Math.min(MAX_EDGE, side);

          const canvas = document.createElement('canvas');
          canvas.width = out;
          canvas.height = out;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas unavailable'));
            return;
          }
          ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
          const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          if (!dataUrl || dataUrl.length > MAX_DATA_URL_CHARS) {
            reject(new Error('Image too large after compress'));
            return;
          }
          resolve(dataUrl);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
