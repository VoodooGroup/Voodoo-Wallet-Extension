# Voodoo Wallet — Privacy Policy

**Last updated:** July 14, 2026  
**Version:** 1.0.6  
**Applies to:** Voodoo Wallet Chrome Extension

## Summary

Voodoo Wallet is a non-custodial PulseChain browser wallet. **We do not operate backend servers and do not collect your personal data on our own systems.** Your keys and recovery phrase are encrypted on your device and are never transmitted to us.

---

## 1. Data stored on your device

| Storage | Data | Purpose |
|---------|------|---------|
| `chrome.storage.local` | Encrypted vault, settings, tokens, NFTs, DApp permissions | Persistent wallet data |
| `chrome.storage.session` | Temporary unlocked session | Stay unlocked while browser is open; cleared on lock |

This data **never leaves your device** except when you explicitly send a blockchain transaction or sign a message.

---

## 2. Third-party services

| Service | Data sent | Purpose |
|---------|-----------|---------|
| **PulseChain RPC** (`rpc.pulsechain.com`, `pulsechain.publicnode.com`) | Wallet address, transaction data | Balances, gas, broadcast transactions |
| **PulseScan API** (`api.scan.pulsechain.com`) | Wallet address | Transaction history |
| **Otterscan** (`otter.pulsechain.com`) | Wallet address (explorer links) | Block explorer |
| **DexScreener** (`api.dexscreener.com`) | None (public API) | VDO, MAGIC, POISON prices |
| **CoinGecko** (`api.coingecko.com`) | None (public API) | PLS price fallback |
| **Open Exchange Rates** (`open.er-api.com`) | None (public API) | Fiat display currency rates |

We do not control these services. They may log IP addresses and request metadata according to their own policies.

---

## 3. DApp connections

When you connect to a website (dApp), the extension may share your **public wallet address** with that site after you approve. You can revoke access in **Settings → Security & Password → Connected sites**.

Sites may request you to **sign messages or send transactions**. You must review and approve each request in the wallet popup.

---

## 4. What we do NOT collect

- No accounts or registration on our servers  
- No analytics or tracking SDKs  
- No selling of personal data  
- No cloud backup of your keys  

---

## 5. Permissions explained

| Chrome permission | Why |
|-------------------|-----|
| `storage` | Save encrypted wallet and settings locally |
| `tabs` | Route DApp provider messages to the correct browser tab |
| Host permissions (RPC, APIs) | Blockchain and price data (see section 2) |
| Content script on all URLs | Inject `window.ethereum` for PulseChain dApp connectivity; we do not read or alter page content |

---

## 6. Security

- Wallet encryption: PBKDF2 (310,000 iterations) + AES-GCM  
- Auto-lock after 10 minutes of inactivity  
- `eth_sign` disabled; transaction details shown before approval  
- You are responsible for keeping your password and recovery phrase safe  

---

## 7. Children's privacy

Voodoo Wallet is not intended for users under 18.

---

## 8. Changes to this policy

We may update this policy when the extension changes. The "Last updated" date at the top will be revised.

---

## 9. Contact

**Email:** info@voodootoken.com

---

## 10. Chrome Web Store

Host `public/privacy-policy-web-extension.html` at a public **HTTPS** URL and enter it in the Chrome Web Store developer dashboard. Configure the URL in `src/config/store.js` (`PRIVACY_POLICY_PUBLIC_URL`).