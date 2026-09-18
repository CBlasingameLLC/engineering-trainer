Engineering Trainer - portable build
====================================

A gap-finder and mastery trainer for electrical engineering. Runs entirely on
this machine. Nothing is uploaded, and it works with no network connection.

REQUIREMENTS
  Node.js 18 or newer.  Check with:  node --version
  Download from https://nodejs.org if you do not have it.

  On Windows you probably want the native installer instead - the .exe or
  .msi needs nothing else installed, starts in its own window rather than a
  browser tab, and stores your progress in a single SQLite file you can copy.
  This portable build exists for machines where you cannot install software.

RUN IT
  Windows   double-click  start.cmd
  macOS     double-click  start.command      (first time: right-click > Open)
  Linux     ./start.sh    or    node serve.mjs

  A browser tab opens at http://127.0.0.1:4173
  Leave the terminal window open while you use it. Close it to stop.

YOUR DATA
  Progress is stored in your browser's IndexedDB, under the address above.
  It survives closing the app. It does NOT sync between browsers or machines,
  and clearing site data for 127.0.0.1 erases it.

  This is the portable build. The desktop build stores the same data in a
  SQLite file instead, which is a single file you can copy and back up.

WHAT TO DO FIRST
  1. Tick the courses you have already taken, with grades and the term.
  2. Take the placement exam. It is adaptive and stops when it has enough
     evidence, usually around 45 questions.
  3. Read the gap report. It separates "never learned" from "learned and has
     since decayed" - those need opposite responses.
  4. The skill tree shows what is unlocked and what is blocked, and by what.
  5. The circuit lab is under "Circuit lab" - draw a circuit and it shows the
     node equations alongside the answer.

TROUBLESHOOTING
  "port in use"       set a different port:  PORT=5000 node serve.mjs
  blank page          check the terminal for errors; Node 18+ is required
  nothing opens       browse to http://127.0.0.1:4173 manually
