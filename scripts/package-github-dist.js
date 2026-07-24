import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'dist');
const OUT = join(ROOT, 'github-dist');

if (!existsSync(join(SRC, 'manifest.json'))) {
  console.error('Run "npm run build" first — dist/manifest.json is missing.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));

function assertManifestPaths(baseDir, m) {
  const checks = [
    m.action?.default_popup,
    m.options_ui?.page,
    m.background?.service_worker,
    ...(m.content_scripts?.[0]?.js || []),
    ...Object.values(m.icons || {}),
  ].filter(Boolean);

  const missing = checks.filter((rel) => !existsSync(join(baseDir, rel)));
  if (missing.length) {
    console.error('Manifest points to missing files:');
    missing.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
}

assertManifestPaths(SRC, manifest);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });

writeFileSync(
  join(OUT, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

writeFileSync(
  join(OUT, 'MANIFEST-README.txt'),
  `CORRECT manifest paths (this package) — NO "dist/" prefix:
  "default_popup": "src/popup/index.html"

WRONG manifest (parent repo only — do NOT use for GitHub upload):
  "default_popup": "dist/src/popup/index.html"
`,
);

writeFileSync(
  join(OUT, 'LOAD-THIS-FOLDER-IN-CHROME.txt'),
  `UPLOAD THIS FOLDER TO GITHUB (or zip it for Releases)

Chrome install:
1. chrome://extensions
2. Developer mode ON
3. Load unpacked -> select THIS folder

IMPORTANT: manifest.json paths must NOT start with "dist/".
This folder is the correct flat package for GitHub.

Version: ${manifest.version}
`,
);

console.log(`GitHub-ready extension package: ${OUT}`);
console.log('Upload the contents of github-dist/ (not the parent repo root manifest).');