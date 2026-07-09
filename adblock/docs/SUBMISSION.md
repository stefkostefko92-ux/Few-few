# Chrome Web Store submission checklist

Everything needed to publish **The Best Ads Block** is in this repo.

## 1. Build the upload package

```bash
bash tools/package.sh
# → dist/the-best-ads-block-<version>.zip
```

This zip contains only the runtime files (manifest, scripts, styles, rules,
icons, locales). README, tools, store art and dev files are excluded.

## 2. Assets (in `store/`)

| Asset | Size | File | Required? |
|-------|------|------|-----------|
| Store icon | 128×128 | `store/store_icon_128.png` | ✅ yes |
| Screenshot | 1280×800 (or 640×400) | _take from the running extension_ | ✅ at least 1 |
| Small promo tile | 440×280 | `store/promo_small_440x280.png` | optional |
| Marquee promo | 1400×560 | `store/marquee_1400x560.png` | optional (featuring) |

Regenerate icons/art any time with `python3 tools/generate_icons.py`.

### Screenshots
Chrome requires at least one. Take them from the real extension:
1. Load the unpacked extension (`chrome://extensions` → Load unpacked).
2. Open the popup on a content-heavy site and screenshot it.
3. Open the settings page (⚙️) and screenshot it.
4. Crop/scale to 1280×800. Place them under `store/` if you want them tracked.

## 3. Listing text

Copy from `docs/STORE_LISTING.md`:
- Name, summary, detailed description
- Category: Productivity
- Permission justifications (copy verbatim into the dashboard)

## 4. Privacy

- Single purpose: "Block advertisements and trackers on the pages you visit."
- Data usage: select **does not collect** for every category.
- Privacy policy URL: host `PRIVACY.md` (e.g. on carbonstealth.eu) and paste the link.

## 5. Dashboard steps

1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (one-time $5 registration fee).
2. **New item** → upload the zip from step 1.
3. Fill in the listing (step 3), upload assets (step 2).
4. Complete the **Privacy practices** tab (step 4).
5. Set visibility (Public / Unlisted) and **Submit for review**.

## 6. Pre-flight check

- [ ] `manifest.json` version bumped (matches `package.json`)
- [ ] Zip loads cleanly via "Load unpacked" with no console errors
- [ ] Popup, settings, allowlist, picker, theme switch all work
- [ ] YouTube video plays with no ads; a normal site loads correctly
- [ ] Privacy policy is reachable at a public URL

Review usually takes a few days. Updates: bump the version, rebuild, upload.
