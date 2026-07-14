import { readFileSync, writeFileSync } from 'fs';

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

writeFileSync('manifest.json', `${JSON.stringify(root, null, 2)}\n`);

writeFileSync(
  'dist/LOAD-THIS-FOLDER-IN-CHROME.txt',
  `SELECT THIS FOLDER in Chrome -> Load unpacked

Path: ${process.cwd()}\\dist

You can also load the parent folder after "npm run build".
If you see a main.jsx MIME error, you are not running the built extension.
Run "npm run build", then load the "dist" folder (or this parent folder) in chrome://extensions.

Version: ${dist.version}
`,
);