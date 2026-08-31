# Releasing

## Cutting a release

Actions → **Release** → *Run workflow*, on `main`. Pick `patch`, `minor` or
`major`; leave **version** blank unless you mean to override it.

That is the whole thing. The workflow refuses to run off `main`, works out the
version from the last `vX.Y.Z` tag, runs `npm run check`, builds both browsers
with that version stamped into their manifests, and publishes a GitHub Release
carrying three archives:

| | |
|---|---|
| `microbrewery-firefox-<v>.zip` | installable, `manifest.json` at the root |
| `microbrewery-chrome-<v>.zip` | same, for Chrome and Edge |
| `microbrewery-source-<v>.zip` | the tracked tree, for add-on review |

Release notes are the commit subjects since the previous tag.

**The first release has no tag to count from**, so a bump has no base — the
workflow will stop and say so. Put the version you want in the **version** box
(`0.1.0`, or `1.0.0` if you consider it done) for that one run only.

Nothing is ever committed back to `main`. The tags are the record of what has
shipped, which is also why this doesn't collide with the branch ruleset.

## Submitting to the stores

**None of this is automated, and the first submission can't be** — there is no
listing for an API to update until you have made one by hand. Do it once per
store; automation can come after.

### Before either store will take it

- [ ] **An icon set.** The extension has none today: no `icons` key in either
      `targets/*/manifest.json`, so it shows as a generic puzzle piece. Needs
      16, 32, 48 and 128px PNGs. Chrome will not publish without the 128; AMO
      uses it as the listing image.
- [ ] **At least one screenshot at 1280×800.** Both stores. Chrome allows five
      and it is worth filling all five.
- [ ] **A 440×280 small promotional tile** — Chrome only, and mandatory.
      Extensions without one are ranked below extensions with one.
- [ ] **A disclaimer.** "Microbrewery" is a good name precisely because it
      carries nobody else's mark, but the description names D&D Beyond. Both
      stores prohibit implying an affiliation you do not have. Say plainly, in
      both listings and the README: *not affiliated with or endorsed by Wizards
      of the Coast or D&D Beyond.*

### Firefox — addons.mozilla.org

No fee. Sign in at the [Developer Hub](https://addons.mozilla.org/developers/),
submit a new add-on, upload `microbrewery-firefox-<v>.zip`, choose **listed**.

- **You will be asked for source.** The extension is bundled and minified, so
  Mozilla's source-code submission rule applies. Upload
  `microbrewery-source-<v>.zip`; `BUILDING.md` at its root is the build
  instruction file reviewers look for. Reviewers rebuild on Ubuntu with a
  recent Node — worth running `npm ci && npm run build` on Node 24 once
  yourself, because a reviewer hitting a build failure is a rejection.
- **License**: MIT. Required at submission; that is why `LICENSE` exists.
- The add-on id is already pinned in the manifest
  (`dndbeyond-homebrew-wysiwyg@ganimomer.dev`), so updates attach to the same
  listing.

### Chrome — Chrome Web Store

[Register](https://developer.chrome.com/docs/webstore/register) first: **$5,
one time**, covering up to 20 extensions. Then create the item and upload
`microbrewery-chrome-<v>.zip`.

Most reviews finish within three days, but Google explicitly flags new
developers, new extensions and broad permissions for closer scrutiny — expect
the first one to be the slow one. `host_permissions` is scoped to
`*://*.dndbeyond.com/*` rather than `<all_urls>`, which is the best thing going
for review time; be ready to explain in the reviewer notes why the extension
needs to read and write the homebrew editor form.

### Automating it later

Once both listings exist, a `release: published` trigger can update them:
[`web-ext sign`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
v8+ submits listed AMO versions, and
[`chrome-webstore-upload-cli`](https://github.com/fregante/chrome-webstore-upload-cli)
handles Chrome. Keep it on `release: published` rather than on every merge —
both stores review what you send, and shipping is worth one deliberate click.

One trap for later: the Chrome refresh token stops working if it goes six
months unused.
