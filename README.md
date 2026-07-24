# Voodoo Wallet ÔÇö Chrome Extension
 
A **PulseChain-only Chrome extension** wallet with **VDO staking**, send/receive, NFTs, and MetaMask-compatible dApp support.
 
[![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)](https://developer.chrome.com/docs/extensions/)
[![PulseChain](https://img.shields.io/badge/Chain-PulseChain%20369-7C3AED)](https://pulsechain.com/)
[![Version](https://img.shields.io/badge/version-1.0.6-green)](https://github.com/VoodooGroup/Voodoo-Wallet-Extension/releases)
 
**Repository:** [github.com/VoodooGroup/Voodoo-Wallet-Extension](https://github.com/VoodooGroup/Voodoo-Wallet-Extension)
 
**PulseChain-only browser wallet** with VDO staking, send/receive, NFTs, and MetaMask-compatible dApp support.
---
 
## Overview
 
Voodoo Wallet is a non-custodial browser wallet for **PulseChain (chain 369)**. Create or import a wallet, hold PLS and tokens, stake VDO, and connect to PulseChain dApps via `window.ethereum`.
 
This repository includes a **pre-built `dist/` folder**, so end users do **not** need Node.js or `npm` to install the extension. Developers can edit `src/` and rebuild when needed.
 
Pairs well with [Voodoo Token Badge](https://github.com/Voodoo-Token/voodoo-token-badge) if you want to show **VDO accepted here** on your WordPress site.
 
| | |
|---|---|
| **Version** | 1.0.6 |
| **Chain** | PulseChain (369) |
| **Build required?** | No ÔÇö pre-built `dist/` included |
**Official site:** [voodootoken.com](https://voodootoken.com)
 
---
 
## Download & install (users)
## Features
 
- **Create or import wallet** ÔÇö 12/24-word phrase or private key
- **Send and receive** PLS and ERC-20 tokens
- **Portfolio view** ÔÇö balances, custom tokens, NFT collections
- **Activity history** ÔÇö on-chain transaction feed
- **VDO staking** ÔÇö approve, stake, and unstake (contract `0x3359EcA752F8fCa2A1E47EF01160CFCd782BD6E7`)
- **dApp support** ÔÇö `eth_requestAccounts`, signing, and transaction approval UI
- **Password-protected vault** ÔÇö PBKDF2 + AES-GCM, auto-lock after idle
- **Fiat display** ÔÇö optional portfolio value in selected currency
- **Light / dark theme**
 
No Node.js or `npm` needed. Follow these steps exactly.
---
 
### Step 1 ÔÇö Download
## Requirements
 
1. Open this GitHub repository
2. Click the green **Code** button
3. Click **Download ZIP**
4. Save the file to your computer
| Requirement | Version |
|-------------|---------|
| Google Chrome (or Chromium) | Latest recommended |
| PulseChain RPC | Public endpoints (built-in) |
 
### Step 2 ÔÇö Unzip
No account, API key, or backend server required. Keys stay on the device.
 
1. Right-click the downloaded `.zip` file
2. Choose **Extract AllÔÇª** / **Uitpakken**
3. Open the extracted folder in File Explorer
### Staking contract
 
### Step 3 ÔÇö Find the correct folder
| Item | Value |
|------|-------|
| VDO token | `0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00` |
| Staking contract | `0x3359EcA752F8fCa2A1E47EF01160CFCd782BD6E7` |
| Chain ID | `369` (`0x171`) |
 
GitHub adds an extra wrapper folder. Your path often looks like this:
---
 
```
­ƒôü voodoo-pulse-extension-main          ÔåÉ ÔØî WRONG (no manifest here)
   ÔööÔöÇÔöÇ ­ƒôü voodoo-pulse-extension-main   ÔåÉ open this
          Ôö£ÔöÇÔöÇ ­ƒôü dist                     ÔåÉ Ô£à SELECT THIS in Chrome
          Ôö£ÔöÇÔöÇ ­ƒôü src
          Ôö£ÔöÇÔöÇ manifest.json
          ÔööÔöÇÔöÇ ...
```
## Installation
 
> **Important:** Do **not** select the outer folder. Select the **`dist`** folder inside the inner project folder.
### From GitHub ÔÇö Download ZIP (users)
 
**Quick check:** the folder you load in Chrome must contain a file named `manifest.json`.
This repo ships with a built **`dist/`** folder. No compile step is required.
 
### Step 4 ÔÇö Load in Chrome
1. Open this repository on GitHub
2. Click the green **Code** button ÔåÆ **Download ZIP**
3. Unzip the file on your computer
4. Open the **inner** project folder (GitHub often creates a double folder, e.g. `voodoo-pulse-extension-main/voodoo-pulse-extension-main/`)
5. In Chrome go to **`chrome://extensions`**
6. Turn **Developer mode** ON
7. Click **Load unpacked**
8. Select the **`dist`** folder inside the project
 
1. Open Chrome and go to: `chrome://extensions`
2. Turn **Developer mode** ON (top-right toggle)
3. Click **Load unpacked** / **Uitgepakte extensie laden**
4. Navigate to the **`dist`** folder from Step 3
5. Click **Select Folder** / **Map selecteren**
> **Do not** select the outer download folder (`voodoo-pulse-extension-main` only). That folder has no `manifest.json` and Chrome will show: *Manifest missing / ontbreekt*.
 
Voodoo Wallet should appear in your extensions. Pin it from the puzzle icon in the toolbar.
**Quick check:** the folder you select must contain `manifest.json` at its top level.
 
### Step 5 ÔÇö First use
### From GitHub Releases (recommended for end users)
 
1. Click the Voodoo Wallet icon
2. Create a new wallet or import an existing phrase / private key
3. Set a password and **save your recovery phrase offline**
For a flat zip without nested source folders:
 
---
1. Open **[Releases](https://github.com/VoodooGroup/Voodoo-Wallet-Extension/releases)**
2. Download **`voodoo-wallet-chrome.zip`** from the latest release (when published)
3. Unzip ÔÇö `manifest.json` should be at the top level of the extracted folder
4. **`chrome://extensions`** ÔåÆ Developer mode ÔåÆ **Load unpacked** ÔåÆ select the unzipped folder
 
## Installatie (Nederlands)
### Installatie (Nederlands)
 
1. GitHub ÔåÆ **Code** ÔåÆ **Download ZIP**
2. Zip uitpakken
3. Open de **binnenste** map (twee keer dezelfde mapnaam ÔåÆ kies de **onderste**)
3. Open de **binnenste** map (niet alleen de buitenste `voodoo-pulse-extension-main`)
4. Chrome ÔåÆ `chrome://extensions` ÔåÆ **Ontwikkelaarsmodus** aan
5. **Uitgepakte extensie laden** ÔåÆ selecteer de map **`dist`**
 
| Map | Werkt? |
|-----|--------|
| `voodoo-pulse-extension-main` (buitenste map) | ÔØî Manifest ontbreekt |
| `voodoo-pulse-extension-main` (buitenste) | ÔØî Manifest ontbreekt |
| `...\voodoo-pulse-extension-main\dist` | Ô£à Correct |
 
Chrome kan een waarschuwing tonen: *"Deze extensie is niet van de Chrome Web Store"*. Dat is normaal bij handmatige installatie.
Chrome kan waarschuwen dat de extensie niet uit de Chrome Web Store komt. Dat is normaal bij handmatige installatie.
 
### From Git (developers)
 
```bash
git clone https://github.com/VoodooGroup/Voodoo-Wallet-Extension.git
cd voodoo-pulse-extension
npm install
npm run build
```
 
Then in Chrome: **Load unpacked** ÔåÆ select the **`dist`** folder.
 
After code changes, run `npm run build` again and click **Reload** on the extension card.
 
### First-time setup
 
1. Click the Voodoo Wallet toolbar icon
2. Create a new wallet or import a phrase / private key
3. Set a password and **save your recovery phrase offline**
4. Unlock to view balances and use Send / Stake / dApps
 
---
 
## Troubleshooting
## How it works
 
| Error | Cause | Fix |
|-------|-------|-----|
| **Manifest missing / ontbreekt** | Wrong folder selected | Select the **`dist`** subfolder, not the outer download folder |
| **MIME type `main.jsx`** | Source folder loaded without build | Use the **`dist`** folder from this repo |
| Extension does not appear | Developer mode off | Enable Developer mode on `chrome://extensions` |
```
Download & unzip ÔåÆ Load dist/ in chrome://extensions
    Ôåô
Create or import wallet ÔåÆ Set password
    Ôåô
Unlock ÔåÆ View portfolio on PulseChain
    Ôåô
Send tokens / Stake VDO / Connect to dApps
    Ôåô
Extension auto-locks after idle timeout
```
 
More help: see `LOAD-IN-CHROME.txt` in this repository.
### Extension defaults
 
- **PulseChain only** ÔÇö chain switch to other networks is rejected
- **`eth_sign` disabled** ÔÇö sites must use `personal_sign`
- **dApp requests** require explicit approval in the popup
- **Auto-lock** after 10 minutes idle (configurable)
- **Read-only RPC** methods are whitelisted without prompts
 
---
 
## External services
 
The extension may contact:
 
| Service | Purpose |
|---------|---------|
| [rpc.pulsechain.com](https://rpc.pulsechain.com) | Balances, transactions, staking |
| [api.scan.pulsechain.com](https://scan.pulsechain.com) | Activity history |
| [api.coingecko.com](https://www.coingecko.com) | Fiat prices |
| [api.dexscreener.com](https://dexscreener.com) | Token prices |
| [open.er-api.com](https://open.er-api.com) | Exchange rates |
 
No personal data is sent to Voodoo Token servers. Keys never leave the device.
 
---
 
## FAQ
 
**Where do I load the extension in Chrome?**  
`chrome://extensions` ÔåÆ Developer mode ÔåÆ **Load unpacked** ÔåÆ select the **`dist`** folder.
 
**Why does Chrome say ÔÇ£Manifest missingÔÇØ?**  
You selected the wrong folder. Open the inner project folder and choose **`dist`**, not the outer `voodoo-pulse-extension-main` wrapper.
 
**Do I need to run `npm install`?**  
No ÔÇö not for normal install. Only developers changing source code need Node.js and `npm run build`.
 
**Can I install with one click from this website?**  
No. Chrome blocks direct website installs. Use the Chrome Web Store listing (when available) or manual **Load unpacked**.
 
**Does this work in Firefox or Edge?**  
Built and tested for **Chrome / Chromium** (Manifest V3). Other browsers are not officially supported.
 
**Is `eth_sign` supported?**  
No ÔÇö disabled for security. dApps should use `personal_sign` or typed data signing.
 
---
 
## Features
## Limitations
 
- Create or import wallet (12/24-word phrase or private key)
- Send and receive PLS and tokens
- Portfolio, NFTs, and transaction history
- Stake VDO (contract `0x3359EcA752F8fCa2A1E47EF01160CFCd782BD6E7`)
- Connect to PulseChain dApps via `window.ethereum`
- Password-protected vault with auto-lock
- **PulseChain only** ÔÇö no Ethereum mainnet or other EVM chains
- **Manual install** from GitHub shows a Chrome ÔÇ£not from Web StoreÔÇØ warning
- **GitHub Code ZIP** has a nested folder structure ÔÇö users must select **`dist`**
- **Professional audit recommended** before holding large amounts
 
---
 
## For developers
## Project structure
 
```
voodoo-pulse-extension/
Ôö£ÔöÇÔöÇ src/
Ôöé   Ôö£ÔöÇÔöÇ popup/           # React wallet UI
Ôöé   Ôö£ÔöÇÔöÇ background/      # Service worker & dApp policy
Ôöé   Ôö£ÔöÇÔöÇ content/         # Page bridge
Ôöé   Ôö£ÔöÇÔöÇ inpage/          # window.ethereum provider
Ôöé   Ôö£ÔöÇÔöÇ lib/             # Wallet, vault, chain, staking
Ôöé   ÔööÔöÇÔöÇ config/          # PulseChain, RPC, staking addresses
Ôö£ÔöÇÔöÇ dist/                # Pre-built extension (load this in Chrome)
Ôö£ÔöÇÔöÇ public/              # Icons and static assets
Ôö£ÔöÇÔöÇ docs/                # Store listing, privacy policy, install guide
Ôö£ÔöÇÔöÇ tests/               # Unit tests (vault, validation, dapp methods)
Ôö£ÔöÇÔöÇ manifest.json        # Root manifest (after build; points to dist/)
Ôö£ÔöÇÔöÇ extension.manifest.json
Ôö£ÔöÇÔöÇ package.json
ÔööÔöÇÔöÇ README.md            # This file (GitHub)
```
 
---
 
## Development
 
### Local dev
 
```bash
npm install
npm run dev      # development with hot reload
npm run build    # production build ÔåÆ dist/
npm test         # run unit tests
npm run dev
```
 
After changing source code:
Load the **`dist`** folder in Chrome after the dev build runs. Click **Reload** on the extension card after changes.
 
### Production build
 
```bash
npm run build
```
 
Then reload the extension on `chrome://extensions`.
Outputs to `dist/` and updates the root `manifest.json`.
 
Load in Chrome during development:
### Tests
 
- `dist/` folder (recommended), or
- project root after `npm run build`
 
---
```bash
npm test
```
 
## Security (v1.0.5+)
### Security (v1.0.5+)
 
- Vault: PBKDF2 (310k iterations) + AES-GCM
- Vault: PBKDF2 (310k iterations) + AES-GCM via Web Crypto
- Send: address validation + confirmation screen
- dApps: full tx/message details before approve; `eth_sign` disabled
- Auto-lock after 10 minutes idle
- RPC fallback endpoints
- dApps: full tx/message details before approve; read-only RPC whitelist
- Private key export: confirm dialog, hidden by default, auto-clear 60s
 
**Recommended:** use a dedicated wallet, keep offline backups, and get a professional security audit before holding large amounts.
 
### GitHub Releases
 
For end-user zips, attach a flat **`voodoo-wallet-chrome.zip`** containing only the contents of `dist/` (so `manifest.json` is at the zip root). See `docs/STORE_LISTING.md` for Chrome Web Store submission copy.
 
---
 
## Changelog
 
### 1.0.6
- Pre-built `dist/` included in repository for GitHub download install
- Install documentation and troubleshooting (nested folder / manifest errors)
 
### 1.0.5
- Security hardening: vault KDF, dApp policy, auto-lock, RPC fallback
 
See git tags and [Releases](https://github.com/VoodooGroup/Voodoo-Wallet-Extension/releases) for older versions.
 
---
 
## Contributing
 
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-change`
3. Run `npm test` and `npm run build`
4. Commit your changes and open a pull request
 
Please keep changes focused and test in Chrome with **Load unpacked** before submitting.
 
---
 
## Privacy policy
 
- **In extension:** Settings ÔåÆ View privacy policy
- **Public URL:** https://voodootoken.com/privacy-policy-web-extension.html
- **Public URL:** [voodootoken.com/privacy-policy-web-extension.html](https://voodootoken.com/privacy-policy-web-extension.html)
- **Contact:** info@voodootoken.com
 
---
 
## Chrome Web Store
## Support
 
Prefer one-click install? Use the official Chrome Web Store listing when available.
- Website: [voodootoken.com](https://voodootoken.com)
- Issues: [GitHub Issues](https://github.com/VoodooGroup/Voodoo-Wallet-Extension/issues)
 
---
 
For store submission assets and copy, see `docs/STORE_LISTING.md`.
Built for the [Voodoo Token](https://voodootoken.com) community on PulseChain.
