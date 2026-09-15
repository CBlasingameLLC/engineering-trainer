/**
 * Minimal declaration for `@tauri-apps/plugin-sql`.
 *
 * The package is only present in a desktop build. Declaring the shape here lets
 * the web build type-check without it installed, which keeps `pnpm build` and
 * the end-to-end verification working on a machine with no Tauri toolchain.
 */
declare module '@tauri-apps/plugin-sql' {
  export default class Database {
    static load(path: string): Promise<Database>;
    execute(query: string, values?: unknown[]): Promise<unknown>;
    select<T>(query: string, values?: unknown[]): Promise<T>;
  }
}
