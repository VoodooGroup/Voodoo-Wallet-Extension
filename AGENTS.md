# Project instructions

## Versioning
- Do **not** bump `version` in `package.json` or `extension.manifest.json` on every fix or build.
- Keep the current version unless the user explicitly asks for a release / version bump.
- After code changes, run `npm run build` as usual; Chrome reload still picks up JS/CSS changes without a new version number.
