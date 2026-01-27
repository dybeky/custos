declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: typeof Database
  }

  export interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }

  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null)
    run(sql: string, params?: unknown[]): Database
    exec(sql: string, params?: unknown[]): QueryExecResult[]
    each(sql: string, params: unknown[], callback: (row: unknown) => void, done?: () => void): Database
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
    getRowsModified(): number
  }

  export class Statement {
    bind(params?: unknown[]): boolean
    step(): boolean
    getAsObject(params?: unknown): Record<string, unknown>
    get(params?: unknown[]): unknown[]
    run(params?: unknown[]): void
    reset(): void
    free(): void
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
}
