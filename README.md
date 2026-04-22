# EU4 Wiki Offline

Windows-first Electron app for browsing an offline snapshot of the EU4 Chinese wiki.

## Project layout

- `app/`: desktop app source code
- `scripts/`: content build, pack, verify, and release metadata tools
- `scripts/generated/`: generated manifests for the app and public releases
- `www.eu4cn.com/`: local source snapshot used to build the content pack (ignored for Git)

## Development

```bash
npm install
npm run build:content
npm run build:release-meta
npm run dev
```

If no content pack has been imported yet, the app starts in setup mode and guides the user to install one.

## Public distribution flow

1. Prepare the source snapshot in `www.eu4cn.com/`
2. Run `npm run plan:content` to estimate the current pack size
3. Run `npm run pack:content:core` for the distribution-oriented pack, or `npm run pack:content:full` for the full archival pack
3. Run `npm run dist:win`
4. Publish these artifacts together:
   - `EU4 Wiki Offline-<version>-Setup.exe`
   - `eu4wiki-content-<contentVersion>-core.zip` or `eu4wiki-content-<contentVersion>-full.zip`
   - `release-manifest.json`
   - checksums from `artifacts/checksums.txt`

## Testing the installed build right now

For local testing you do not need to wait for a packaged content zip:

1. Install `dist/EU4 Wiki Offline-0.1.0-Setup.exe`
2. Launch the app
3. Choose `导入内容包或内容目录`
4. Select the existing folder `D:\renheyu\eu4_wiki_app_offline\www.eu4cn.com`

This is the fastest path to verify the installed app before you spend time generating large public content archives.

## Release notes checklist

- App version and content pack version match `scripts/generated/release-manifest.json`
- Include SHA256 for every installer and content file
- Link to `NOTICE`, `ATTRIBUTION`, and `THIRD_PARTY_LICENSES`
- Describe this as an offline desktop reader / offline packaging project, not an official mirror
