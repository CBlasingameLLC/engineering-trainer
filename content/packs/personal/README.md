Personal-only content.

Packs derived from a textbook or other third-party source live here with
`licenseTier: "personal-only"`. Import them with:

```sh
pnpm content import --personal
```

**Getting these into an installed application is a separate question with three
answers — see `docs/PERSONAL-CONTENT.md`.** The short version: the shipped app
reads `*.json` from a folder beside its database, so the normal answer is to
copy the file there and restart. Nothing below changes.

## The three places this is enforced, and the fourth that was missing

1. This directory is gitignored, so the material is never committed.
2. The pack schema **rejects** a personal-only item inside a redistributable
   pack, so it cannot be smuggled into `content/packs/shared/`.
3. The app does not bundle these packs unless a build explicitly asks for them.

Point 3 used to be "the app never bundles these packs", which sounds stricter
and was actually useless: owned material could not sharpen the owner's own
training either, so the rule had all of the cost and none of the benefit.

The distinction that matters is not development against production — your own
installer is a production build — but **redistributable against personal**. So
it is an opt-in at build time:

```sh
VITE_ET_INCLUDE_PERSONAL=1 pnpm tauri build
```

Default off, so any artifact built without thinking about it is safe to hand to
someone else, and CI never sets it.

4. A build that did include personal material **says so in the app**, on every
   screen, with the item count. Three enforcement points that are all invisible
   from inside the running binary are three points that cannot be checked by
   the person holding it.

The same badge counts packs loaded from the runtime folder, which matters more
than it first looks: a redistributable installer that has been pointed at
somebody's personal packs is, from that moment, an installation carrying owned
material, and the count is the only thing that says so.

## What belongs here

Your own homework and your own worked solutions are yours and are not the
constrained case. What is constrained is someone else's text and someone else's
problems — a publisher's, or an instructor's where the syllabus says so. EE 4392
is the live example: its syllabus prohibits redistributing lecture material, so
nothing in the committed EE 4392 packs reproduces a slide, a checklist question
or an exam item, and anything that did would belong here instead.

## Checking the quarantine yourself

The flag is the kind of thing that gets flipped by accident, and CI cannot
guard it — a CI check would need a personal pack committed to the repository,
which is the exact thing being prevented. So the check is manual, cheap and
decisive:

```sh
# drop a pack here containing a unique string, then:
pnpm --filter @et/desktop build
grep -r CANARY apps/desktop/dist/            # must find nothing

VITE_ET_INCLUDE_PERSONAL=1 pnpm --filter @et/desktop build
grep -r CANARY apps/desktop/dist/            # must find it
```

Both directions matter. The first says the quarantine holds; the second says
the opt-in actually works, which is the half that fails silently and leaves you
studying a bank that is quietly smaller than you think.
