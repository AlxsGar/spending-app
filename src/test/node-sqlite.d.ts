// Delete this file if @types/node is ever added.
//
// The project has no @types/node (and the app does not need it), so this
// declares only the part of Node's built-in node:sqlite that
// src/test/real-sqlite.ts uses.
declare module 'node:sqlite' {
  type Param = string | number | null;

  interface StatementSync {
    get(...params: Param[]): Record<string, unknown> | undefined;
    all(...params: Param[]): Record<string, unknown>[];
    run(...params: Param[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string, options?: { enableForeignKeyConstraints?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
