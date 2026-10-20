# Installing on macOS

The macOS build is **Apple Silicon only** (M1 through M4) and **unsigned**. Both
are deliberate, and the second one is the reason this page exists: macOS will
refuse to open the app on the first try, and the message it shows blames the
file rather than the missing Apple account.

## Getting the file

`.github/workflows/macos.yml` builds on every push and publishes the result as a
run artifact. Open the run on GitHub → **Artifacts** → download
`engineering-trainer-macos` (or `engineering-trainer-macos-personal`, if that
build included your own packs — see [PERSONAL-CONTENT.md](PERSONAL-CONTENT.md)).

The zip contains two ways in, and you only need one:

| File | Use it when |
|---|---|
| `Engineering Trainer_0.1.0_aarch64.dmg` | Normal install. Open it, drag the app to Applications. |
| `Engineering Trainer.app.zip` | You would rather not mount a disk image. Unzip and move the app yourself. |

## Making macOS open it

Everything downloaded through a browser is tagged with a quarantine attribute.
For a signed, notarized app macOS checks that tag against Apple and lets it
through. This app has no Apple Developer identity behind it, so the check fails
and you get one of:

> **"Engineering Trainer" is damaged and can't be opened.**
> **"Engineering Trainer" cannot be opened because the developer cannot be verified.**

Neither is true. The app is fine; it is unsigned. Clear the tag:

```sh
xattr -dr com.apple.quarantine "/Applications/Engineering Trainer.app"
```

Then open it normally. You only do this once per install.

If you would rather not run a command: **right-click the app → Open**, then
**Open** again in the dialog. On macOS Sequoia and later that route may be gone,
in which case open it once, then go to **System Settings → Privacy & Security**,
find the "was blocked" line near the bottom and click **Open Anyway**.

### Why the build is ad-hoc signed anyway

Apple Silicon will not execute a binary carrying *no* signature at all, so CI
signs the bundle with `codesign --sign -`. That is not a developer identity and
does not satisfy Gatekeeper — it only makes the failure the honest one
("unidentified developer") rather than the misleading one ("damaged"), and it
means the app actually launches once the quarantine tag is gone.

### If you want the warning to stop entirely

That needs a paid Apple Developer account ($99/year) and three repository
secrets — a Developer ID certificate, its password, and an app-specific password
for notarization. Tauri reads them from `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD` and `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`.
Adding them changes nothing about the workflow's shape: the build step picks
them up and signs and notarizes on its own. Without them, the two steps above
are the whole cost.

## Where your data lives

| What | Path |
|---|---|
| Database | `~/Library/Application Support/com.cblasingame.engineering-trainer/trainer.db` |
| Your own packs | `~/Library/Application Support/com.cblasingame.engineering-trainer/packs/` |
| Progress exports | `~/Downloads/engineering-trainer-progress-<date>.json` |

Uninstalling the app does not remove any of these, which is intentional:
reinstalling over the top keeps your history.

## Carrying progress between this Mac and another machine

On the machine that has the history: **Briefing → Progress transfer → Export**.
It writes a `.json` into `~/Downloads` and tells you the exact path. Copy that
file to the other machine and use **Import** there.

The import **merges**. Nothing already on the receiving machine is discarded,
and applying the same file twice does nothing the second time — so you can
export after every session without keeping track of which ones you have already
carried across, and you can go in both directions without the two machines
fighting each other.

What that costs: XP takes the higher of the two numbers rather than the sum, and
the streak takes the longer. Both are motivational counters rather than
measurements, and anything else either double-counts shared history or inflates
on a repeated import. The attempt log — which every mastery, retention and gap
figure is actually computed from — is merged exactly, so the diagnosis on both
machines is identical once the file has been carried across.

## Building it yourself

If you have Xcode command-line tools and a Rust toolchain:

```sh
pnpm install --frozen-lockfile
pnpm tauri build --target aarch64-apple-darwin
```

The bundle lands in
`apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/`. A build you
produced locally is not quarantined, so none of the above applies to it.
