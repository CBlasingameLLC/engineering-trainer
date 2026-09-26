# Getting your own material into an installer

Three routes, in order of how little work they cost you. They are not
alternatives to each other in the usual sense — the first one is how you should
normally do it, and the other two exist because the first one has one thing it
cannot do.

Throughout, "personal material" means a pack whose `provenance.licenseTier` is
`personal-only`: items derived from a textbook, a publisher's homework system,
or lecture material an instructor's syllabus says not to redistribute. Your own
homework and your own worked solutions are yours and are not this case.

## Why this is a problem at all

The quarantine has four enforcement points, described in
`content/packs/personal/README.md`, and the load-bearing one here is the first:
**`content/packs/personal/` is gitignored**. Nothing in it is committed.

The Windows installers are built by `.github/workflows/windows.yml`, on GitHub's
runners, from a fresh clone of the repository. A fresh clone does not contain
gitignored files. So that directory is *empty* on the machine that builds the
installer, and setting `VITE_ET_INCLUDE_PERSONAL=1` there would faithfully
bundle nothing at all — a build that succeeds, reports no error, and ships a
smaller bank than you think it has.

That is the gap. Below is how to close it.

---

## Route 1 — the packs folder (no rebuild, ever)

The shipped application reads `*.json` packs from a folder beside its database
at every startup. Nothing needs rebuilding, nothing enters git, and the
installer itself stays redistributable.

**Where the folder is.** The app tells you: it is printed in the **Content
library** panel on the briefing screen, and the text is selectable. It is:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\com.cblasingame.engineering-trainer\packs\` |
| Linux | `~/.config/com.cblasingame.engineering-trainer/packs/` |
| macOS | `~/Library/Application Support/com.cblasingame.engineering-trainer/packs/` |

The app creates it on first launch, so it is already there.

**What to do.**

1. Copy your pack `.json` files into that folder.
2. Restart the app.
3. Check the **Content library** panel. Each file is listed by name with its
   item count, and one marked `personal` contributes to the count in the
   status strip along the bottom.

**What happens to them.** Every file goes through `parsePack` — the same Zod
contract that gates the committed bank — before a single item is loaded. A
malformed pack is reported by name on the error screen and the rest still load.
A pack whose item ids collide with ones already loaded has the colliding items
dropped, and says so, because an item loaded twice counts twice as evidence.

**What this does not do.** It does not run `pack verify`. Verification is the
authoring gate and it lives in the CLI:

```sh
pnpm content verify --strict            # before you copy anything anywhere
```

A pack that has not been through that is a pack whose answer keys nobody has
checked, and the app cannot check them for you — that is the whole reason the
gate is a separate step.

---

## Route 2 — build the installer yourself, with the packs baked in

Use this when you want a single file that already contains everything: a new
machine, a machine you will not be copying files around on, or a backup.

**One-time setup on your Windows machine**

1. [Rust](https://rustup.rs/) — `rustup-init.exe`, defaults are fine.
2. **Visual Studio Build Tools** with the *Desktop development with C++*
   workload. Rust's MSVC toolchain links against it; this is the step that
   cannot be done from Linux, and the reason the installers are built in CI at
   all.
3. [Node 22](https://nodejs.org/) and pnpm 10 — `npm i -g pnpm@10`.
4. WebView2 runtime, which Windows 11 already has.

**Every time**

```powershell
git clone https://github.com/CBlasingameLLC/engineering-trainer.git
cd engineering-trainer
pnpm install --frozen-lockfile

# Your packs, into the gitignored quarantine directory.
copy path\to\your\packs\*.json content\packs\personal\

$env:VITE_ET_INCLUDE_PERSONAL = "1"
pnpm tauri build
```

The installers land in
`apps\desktop\src-tauri\target\release\bundle\` — `msi\*.msi` and
`nsis\*-setup.exe`.

**Check it worked**, because the failure mode is silent:

```powershell
# The app's own status strip should show "N personal · do not redistribute".
```

If it does not, `VITE_ET_INCLUDE_PERSONAL` was not set in the environment the
build actually ran in. That badge is enforcement point four and it exists for
exactly this check.

**The cost.** About twenty minutes of setup once, then roughly ten minutes per
build, and the resulting installer is **not redistributable** — it contains
material you are licensed to hold and not to hand on.

---

## Route 3 — give CI the packs as an encrypted secret

Use this when you want the convenience of a CI build and are willing to put the
material on GitHub's servers to get it.

The workflow already supports it and does nothing unless the secret exists.

**Setting it up**

```sh
# One archive of every personal pack, base64'd into a single line.
cd content/packs/personal
tar czf - *.json | base64 -w0 > /tmp/personal-packs.b64
```

Then in the repository: **Settings → Secrets and variables → Actions → New
repository secret**, named `PERSONAL_PACKS_B64`, with that string as the value.

**What the workflow then does.** Before building, it decodes the secret back
into `content/packs/personal/`, sets `VITE_ET_INCLUDE_PERSONAL=1`, and uploads
the result under the artifact name **`engineering-trainer-windows-personal`**
rather than `engineering-trainer-windows`. The name is different on purpose: an
artifact containing owned material must not be confused with one that can be
handed to somebody else, and a filename is the only label that survives being
downloaded.

**The trade-offs, stated plainly.**

- The material sits in GitHub's secret store. It is encrypted at rest and never
  printed in logs, but it has left your machine, and "encrypted on someone
  else's server" is a different claim from "never left the laptop".
- Every time you add or change a pack you re-roll the whole secret, because it
  is one blob.
- A secret is available to workflows running on every branch of this
  repository, so anyone who can push a workflow file can read it.

Route 1 has none of those properties, which is why it is Route 1.

---

## Which to use

| | Route 1: folder | Route 2: local build | Route 3: CI secret |
|---|---|---|---|
| Setup | none | ~20 min once | ~5 min once |
| Cost per new pack | copy a file | full rebuild | re-roll the secret |
| Material leaves your machine | no | no | yes |
| Produces a shareable installer | yes (without your packs) | no | no |
| Needs Rust and MSVC | no | yes | no |

Use Route 1. Keep Route 2 for when you want one self-contained file. Reach for
Route 3 only if the other two are genuinely in the way.
