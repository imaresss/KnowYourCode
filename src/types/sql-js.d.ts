declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[];
    values: Array<Array<string | number | null>>;
  }

  export interface Statement {
    bind(values?: Array<string | number | null>): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    run(values?: Array<string | number | null>): void;
    reset(): void;
  }

  export class Database {
    public constructor(data?: Uint8Array | Buffer | ArrayLike<number>);
    public exec(sql: string): QueryExecResult[];
    public prepare(sql: string): Statement;
    public export(): Uint8Array;
    public close(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
}
