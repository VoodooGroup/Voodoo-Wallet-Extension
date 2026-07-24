import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Chrome "Load unpacked" of the PROJECT ROOT uses this root manifest.json.
 * Paths must be prefixed with dist/.
 *
 * Critical: the content-script bridge injects the inpage provider via
 *   chrome.runtime.getURL("assets/provider.js-HASH.js")
 * That path is correct only when the extension root is the dist/ folder.
 * When the extension root is the project folder, the real file is
 *   dist/assets/provider.js-HASH.js
 * Without this rewrite, inject fails → window.voodooEthereum is missing
 * (debug: ethereum=true voodooGlobal=false isVoodoo=false).
 */

const dist = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const prefix = (path) => `dist/${path}`;

const root = structuredClone(dist);

root.action.default_popup = prefix(dist.action.default_popup);

if (root.options_ui?.page) {
  root.options_ui.page = prefix(dist.options_ui.page);
}

if (root.action.default_icon) {
  for (const size of Object.keys(root.action.default_icon)) {
    root.action.default_icon[size] = prefix(root.action.default_icon[size]);
  }
}

root.background.service_worker = prefix(dist.background.service_worker);

if (root.content_scripts) {
  root.content_scripts = root.content_scripts.map((entry) => ({
    ...entry,
    js: entry.js.map((file) => prefix(file)),
  }));
}

for (const size of Object.keys(root.icons)) {
  root.icons[size] = prefix(dist.icons[size]);
}

if (root.web_accessible_resources) {
  root.web_accessible_resources = root.web_accessible_resources.map((entry) => ({
    ...entry,
    resources: entry.resources.map((resource) => prefix(resource)),
  }));
}

// --- Project-root content bridge (provider path fix) ---
const assetsDir = join('dist', 'assets');
let rootBridgeWritten = false;

if (existsSync(assetsDir)) {
  const bridgeName = readdirSync(assetsDir).find(
    (f) => f.startsWith('bridge.js-') && f.endsWith('.js'),
  );
  if (bridgeName) {
    let code = readFileSync(join(assetsDir, bridgeName), 'utf8');
    // Rewrite getURL("assets/...") → getURL("dist/assets/...")
    // Also handle single-quoted paths.
    const before = code;
    code = code.replace(/(["'])assets\//g, '$1dist/assets/');
    if (code === before) {
      console.warn(
        '[write-root-manifest] Warning: no assets/ path found in bridge to rewrite.',
      );
    }
    writeFileSync('content-bridge-root.js', `${code}\n`);
    rootBridgeWritten = true;

    // Point root content_scripts at the rewritten bridge
    root.content_scripts = root.content_scripts.map((entry) => ({
      ...entry,
      js: entry.js.map((file) => (
        file.includes('bridge.js') ? 'content-bridge-root.js' : file
      )),
    }));

    // Ensure rewritten provider path is web-accessible
    if (root.web_accessible_resources?.length) {
      root.web_accessible_resources = root.web_accessible_resources.map((entry) => {
        const resources = new Set(entry.resources);
        resources.add('dist/assets/*');
        resources.add('content-bridge-root.js');
        return { ...entry, resources: [...resources] };
      });
    }

    console.log(
      `[write-root-manifest] Root bridge OK → content-bridge-root.js (from ${bridgeName})`,
    );
  }
}

if (!rootBridgeWritten) {
  console.warn('[write-root-manifest] Could not write content-bridge-root.js');
}

writeFileSync('manifest.json', `${JSON.stringify(root, null, 2)}\n`);

writeFileSync(
  'LOAD-IN-CHROME.txt',
  `INSTALL VOODOO WALLET — PROJECT ROOT
=====================================

You load THIS folder in Chrome:
  C:\\Users\\ReMarkt\\voodoo-pulse-extension

(contains manifest.json at the top)

STEPS
-----
1. cd C:\\Users\\ReMarkt\\voodoo-pulse-extension
2. npm run build
3. chrome://extensions → Developer mode ON
4. Load unpacked → select this project folder
5. After every code change: npm run build → Reload extension → Ctrl+F5 on dApp

CHECK that inject works
-----------------------
On http://localhost:8080 open DevTools Console and run:
  window.voodooEthereum
It must be an object (not undefined).
If undefined, the provider did not inject — rebuild + reload extension.

Debug meaning:
  ethereum=true voodooGlobal=false isVoodoo=false
  → MetaMask (or other) is present, but Voodoo inject FAILED.
  → Fixed by content-bridge-root.js (dist/assets/ provider path).

Version: ${dist.version}
`,
);

writeFileSync(
  'dist/LOAD-THIS-FOLDER-IN-CHROME.txt',
  `SELECT THIS dist/ FOLDER in Chrome → Load unpacked

Alternative to loading the project root.
1. chrome://extensions
2. Developer mode ON
3. Load unpacked → select THIS dist folder

Version: ${dist.version}
`,
);

console.log('[write-root-manifest] Wrote root manifest.json');
