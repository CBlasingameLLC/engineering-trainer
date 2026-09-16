# Capabilities

Tauri v2 denies every plugin command unless a capability grants it. Without the
file alongside this one the desktop build starts, renders, and then fails on its
first database call with `Command plugin:sql|load not allowed by ACL` — which is
invisible from the browser build, because that path uses IndexedDB and never
touches the plugin.

`sql:allow-execute` is listed explicitly rather than relying on `sql:default`.
The default set grants `allow-close`, `allow-load` and `allow-select` only — it
is a read-only grant. Using it would let the app boot and read, then fail the
first time it tried to record an attempt, which is a far worse failure than not
starting at all.

Permissions are granted individually rather than by `sql:default` so that what
the app can do is legible here, and so a future plugin upgrade cannot silently
widen or narrow the grant by redefining its default set.
