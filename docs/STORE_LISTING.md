# Chrome Web Store listing — Voodoo Wallet

Use this document when submitting version 1.0.6+ to the Chrome Web Store.

## Single purpose

**PulseChain cryptocurrency wallet** — create/import a wallet, view balances, send/receive tokens, stake VDO, and connect to PulseChain dApps.

## Short description

Non-custodial PulseChain wallet with VDO staking, activity history, and MetaMask-compatible dApp support.

## Detailed description (suggested)

Voodoo Wallet is a non-custodial browser wallet for **PulseChain (chain 369)**.

- Create or import a wallet (12/24-word phrase or private key)
- Send and receive PLS and tokens
- View portfolio, NFTs, and transaction activity
- Stake VDO tokens
- Connect to PulseChain dApps via `window.ethereum`
- Password-protected vault with auto-lock

Your keys never leave your device. We do not collect personal data or run backend servers.

**Privacy policy:** https://voodootoken.com/privacy-policy-web-extension.html

## Permission justifications

| Permission | Justification |
|------------|---------------|
| `storage` | Store encrypted wallet vault, settings, and per-site DApp connection permissions locally. |
| `tabs` | Deliver DApp RPC responses and account updates to the correct browser tab. |
| `host_permissions` (RPC & APIs) | Read balances, broadcast transactions, fetch prices and activity history from PulseChain and public price APIs. |
| Content script on **all URLs** | Inject `window.ethereum` so users can connect to PulseChain dApps on any HTTPS site. The script does not read page content or inject ads. Required for Web3 wallet functionality. |

## Category

**Productivity** or **Finance** (if available in your region).

## Privacy practices (dashboard)

- **No user data collected by developer**
- **No data sold**
- **No data used for unrelated purposes**
- Privacy policy URL: `https://voodootoken.com/privacy-policy-web-extension.html`

## Assets checklist

- [ ] Icon 128×128 (included in extension)
- [ ] Screenshots 1280×800 or 640×400 (popup Home, Send, Settings, dApp connect prompt)
- [ ] Promotional tile 440×280 (optional)
- [ ] Privacy policy hosted at HTTPS URL above
- [ ] Working contact email: info@voodootoken.com

## Upload package

1. Run `npm run build`
2. Zip the contents of the **`dist`** folder (not the project root)
3. Upload the zip in the Chrome Web Store developer dashboard

## Pre-submit test checklist

- [ ] Create wallet, save phrase, unlock
- [ ] Send small PLS test amount
- [ ] Connect to a PulseChain dApp (`eth_requestAccounts`)
- [ ] Approve sign/transaction from dApp
- [ ] Disconnect site in Settings → Connected sites
- [ ] Change password in Settings
- [ ] Lock / unlock wallet