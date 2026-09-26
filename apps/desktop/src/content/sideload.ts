import { isTauri } from '@/storage/tauri';

/**
 * Content packs read from disk at startup rather than compiled into the build.
 *
 * This is how book-derived material reaches an installed application. The
 * alternative paths both have a cost the quarantine should not have to pay:
 * committing the packs puts owned material in version control, and bundling
 * them at build time means the only machine that can produce the learner's own
 * installer is one with the packs on it — which, since the Windows installers
 * are built by CI from a fresh clone, was nowhere.
 *
 * Reading them at runtime makes the artifact and the content independent. The
 * installer that ships stays redistributable, the owned material never leaves
 * the one machine entitled to it, and adding a pack later costs a file copy
 * rather than a rebuild.
 *
 * Nothing is trusted on the way in. The renderer runs every file through the
 * same `parsePack` gate as the compiled bank, so a sideloaded pack is subject
 * to exactly the checks a committed one is.
 */

export interface SideloadedFile {
  readonly name: string;
  /** Empty when the file existed and could not be read. A valid pack never is. */
  readonly text: string;
}

export interface Sideload {
  /** Absolute path of the folder, for the app to show. Null where there is none. */
  readonly dir: string | null;
  readonly files: readonly SideloadedFile[];
  /** Why the folder could not be read at all, as opposed to being empty. */
  readonly error: string | null;
  /** Whether this build has a folder to read — false in the browser. */
  readonly supported: boolean;
}

export const NO_SIDELOAD: Sideload = { dir: null, files: [], error: null, supported: false };

export async function readSideloadedPacks(): Promise<Sideload> {
  // The browser build has no filesystem to look at, and saying "no packs
  // folder" is different from saying "the packs folder is empty".
  if (!isTauri()) return NO_SIDELOAD;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const [dir, pairs] = await Promise.all([
      invoke<string>('personal_packs_dir'),
      invoke<[string, string][]>('personal_packs'),
    ]);
    return {
      dir,
      files: pairs.map(([name, text]) => ({ name, text })),
      error: null,
      supported: true,
    };
  } catch (error) {
    // Never fatal. A failure here costs the learner their own packs, which is
    // worth a loud message on the briefing; it is not worth refusing to start.
    return { dir: null, files: [], error: (error as Error).message || String(error), supported: true };
  }
}
