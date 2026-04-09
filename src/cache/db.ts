import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import initSqlJs, { type Database as SqlJsDatabase, type QueryExecResult, type Statement as SqlJsStatement } from "sql.js";
import { MIGRATION_V2_SQL, MIGRATION_V3_SQL, SCHEMA_SQL } from "./schema";

type SqlValue = string | number | null;

interface PersistableDatabase {
  export(): Uint8Array;
  close(): void;
}

class PreparedStatement {
  public constructor(
    private readonly statement: SqlJsStatement,
    private readonly persist: () => Promise<void>
  ) {}

  public get(...params: SqlValue[]): unknown {
    this.statement.bind(params);
    const hasRow = this.statement.step();
    const row = hasRow ? this.statement.getAsObject() : undefined;
    this.statement.reset();
    return row;
  }

  public all(...params: SqlValue[]): unknown[] {
    this.statement.bind(params);
    const rows: unknown[] = [];
    while (this.statement.step()) {
      rows.push(this.statement.getAsObject());
    }
    this.statement.reset();
    return rows;
  }

  public run(...params: SqlValue[]): void {
    this.statement.run(params);
    this.statement.reset();
    void this.persist();
  }
}

export class Database {
  private readonly preparedStatements: PreparedStatement[] = [];
  private persistQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly db: SqlJsDatabase,
    private readonly dbPath?: string
  ) {}

  public exec(sql: string): QueryExecResult[] {
    const result = this.db.exec(sql);
    void this.persist();
    return result;
  }

  public prepare(sql: string): PreparedStatement {
    const statement = new PreparedStatement(this.db.prepare(sql), async () => this.persist());
    this.preparedStatements.push(statement);
    return statement;
  }

  public close(): void {
    void this.persist(true);
    this.db.close();
  }

  private async persist(force = false): Promise<void> {
    if (!this.dbPath) {
      return;
    }

    const task = async () => {
      await fs.mkdir(path.dirname(this.dbPath as string), { recursive: true });
      const bytes = Buffer.from(this.db.export());
      await fs.writeFile(this.dbPath as string, bytes);
    };

    this.persistQueue = this.persistQueue.then(task, task);
    if (force) {
      await this.persistQueue;
    }
  }
}

export async function openDatabase(context: vscode.ExtensionContext): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(context.extensionPath, "node_modules", "sql.js", "dist", file)
  });

  const dbPath = path.join(context.globalStorageUri.fsPath, "know-your-code.sqlite");
  let db: PersistableDatabase;

  try {
    const data = await fs.readFile(dbPath);
    db = new SQL.Database(data);
  } catch {
    db = new SQL.Database();
  }

  const wrapped = new Database(db as SqlJsDatabase, dbPath);
  wrapped.exec(SCHEMA_SQL);
  runMigrations(wrapped);
  return wrapped;
}

function runMigrations(db: Database): void {
  const allMigrations = [MIGRATION_V2_SQL, MIGRATION_V3_SQL];
  for (const migration of allMigrations) {
    for (const statement of migration.split(";")) {
      const trimmed = statement.trim();
      if (!trimmed) {
        continue;
      }
      try {
        db.exec(trimmed);
      } catch {
        // Already applied — expected on already-migrated databases
      }
    }
  }
}

export async function createInMemoryDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const wrapped = new Database(db as SqlJsDatabase);
  wrapped.exec(SCHEMA_SQL);
  return wrapped;
}
