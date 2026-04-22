# Release Checklist

## Before build

- Place the current wiki snapshot under `www.eu4cn.com/`
- Confirm `build/icon.ico` exists before producing a public installer
- Review `NOTICE`, `ATTRIBUTION`, and `THIRD_PARTY_LICENSES`

## Build

```bash
npm run build:content
npm run build:release-meta
npm run verify:content
npm run plan:content
npm run pack:content:core
npm run dist:win
```

Notes:

- `pack:content:core` is the recommended public distribution pack
- `pack:content:full` keeps more of the original snapshot but is significantly larger and slower to build
- Generate large content packs as a dedicated background task; do not block normal app testing on this step

## Publish

- Upload the installer and content pack together
- Attach SHA256 for every downloadable file
- Publish `scripts/generated/release-manifest.json`
- Reuse `scripts/generated/release-notes-template.md` for GitHub Releases / Baidu Tieba posts
- Describe the package as an offline desktop reader or offline packaging project, not an official mirror
