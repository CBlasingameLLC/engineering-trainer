# Desktop app

React renderer plus a Tauri v2 shell.

## Running it

The renderer is independent of Tauri, so there are two ways in.

**Browser** — no Rust toolchain needed:

```sh
pnpm --filter @et/desktop dev          # vite, http://localhost:5173
```

Storage goes to IndexedDB. Everything works: onboarding, placement, the session
player, the gap report.

**Desktop** — needs the Rust toolchain and platform WebView libraries:

```sh
pnpm --filter @et/desktop tauri dev
pnpm --filter @et/desktop tauri build  # produces an installer
```

Storage goes to SQLite at `sqlite:trainer.db` in the app data directory, with
migrations applied from `src-tauri/migrations/`.

### Linux build prerequisites

```sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

> The Tauri shell has **not been compiled or run** in the environment this was
> developed in — `webkit2gtk`, `gtk3` and `libsoup3` were unavailable, so
> `cargo build` was never executed against it. The Rust side is standard Tauri
> v2 wiring and the SQL adapter mirrors the tested IndexedDB one method for
> method, but treat the first `tauri dev` as unverified. The browser path, by
> contrast, is exercised end-to-end on every run of the e2e suite.

## Why there are two storage adapters

`StorageAdapter` (`src/storage/types.ts`) has two implementations:

- `WebStorageAdapter` — IndexedDB
- `TauriSqlAdapter` — SQLite through `tauri-plugin-sql`

The renderer talks to the interface and never learns which it got. That is what
lets the whole application be driven in a headless browser, which is the only
reason the placement flow could be verified at all on a machine that cannot
build Tauri. It also keeps the desktop build honest: packaging, not a fork.

## End-to-end verification

```sh
pnpm --filter @et/desktop build
pnpm --filter @et/desktop preview &
pnpm --filter @et/desktop e2e
```

The driver plays a real placement session against the real item bank, answering
from the bank's own answer keys and deliberately missing one cluster of topics
(op-amps and transients). It then asserts the gap report localises the weakness
to exactly those topics and flags nothing outside them — which is the product
claim, and cannot be checked any other way.

Environment overrides: `E2E_BASE`, `E2E_CHROME`, `E2E_SHOTS`.

## Layout

```
src/
  content/       curriculum and packs, compiled into the build
  features/      learner-model.ts - replays the attempt log into mastery state
  routes/        Onboarding, Session, Report, Dashboard
  storage/       StorageAdapter and its two implementations
  ui/            KaTeX rendering, mastery band vocabulary
  store.ts       orchestration; the adaptive engine itself lives in @et/domain
src-tauri/       Rust shell, SQLite migrations
e2e/             browser-driven placement flow
```

No mastery logic lives in this package. `@et/domain` is pure and has no I/O, so
the model is testable without a browser; this app threads responses through it
and renders the result.
