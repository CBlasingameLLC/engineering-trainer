#!/usr/bin/env node
/**
 * Assemble the portable bundle.
 *
 * The portable build is the renderer plus a dependency-free static server, so
 * it runs anywhere Node runs. It exists because the native installers are
 * per-platform and have to be built on the platform they target, while this
 * works the same on Windows, macOS and Linux from one artifact.
 */
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const DIST = join(ROOT, 'apps/desktop/dist');
const OUT = join(ROOT, 'release/portable');

const version = JSON.parse(await readFile(join(ROOT, 'apps/desktop/package.json'), 'utf8')).version;

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'app'), { recursive: true });

await cp(DIST, join(OUT, 'app'), { recursive: true });
for (const file of ['serve.mjs', 'README.txt', 'start.sh', 'start.cmd', 'start.command']) {
  await cp(join(HERE, file), join(OUT, file));
}
await writeFile(join(OUT, 'VERSION'), `engineering-trainer ${version}\n`);

console.log(`portable bundle assembled at release/portable (version ${version})`);
console.log('zip it with:  cd release && zip -qr engineering-trainer-portable.zip portable');
