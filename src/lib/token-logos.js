const LOGOS_KEY = 'voodoo_token_logos';

export async function getAllTokenLogos() {
  const result = await chrome.storage.local.get(LOGOS_KEY);
  return result[LOGOS_KEY] || {};
}

export async function saveTokenLogo(address, dataUrl) {
  const key = address.trim().toLowerCase();
  const logos = await getAllTokenLogos();
  logos[key] = dataUrl;
  try {
    await chrome.storage.local.set({ [LOGOS_KEY]: logos });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('QUOTA') || msg.includes('quota')) {
      throw new Error('Logo too large to save. Try a smaller image or add the token without a logo.');
    }
    throw err;
  }
  return logos;
}

export async function removeTokenLogo(address) {
  const key = address.toLowerCase();
  const logos = await getAllTokenLogos();
  delete logos[key];
  await chrome.storage.local.set({ [LOGOS_KEY]: logos });
  return logos;
}