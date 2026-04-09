import { Database } from "./db";
import { ExplanationAction, ExplanationLookup, RelatedSymbol, StoredExplanation } from "../core/types";

export class ExplanationRepository {
  private readonly memoryCache = new Map<string, StoredExplanation>();

  public constructor(private readonly db: Database) {}

  public findValid(params: ExplanationLookup, ttlMs = 0): StoredExplanation | undefined {
    const cacheKey = this.buildLookupKey(params);
    const inMemory = this.memoryCache.get(cacheKey);
    if (inMemory) {
      if (this.isExpired(inMemory.createdAt, ttlMs)) {
        this.memoryCache.delete(cacheKey);
      } else {
        return inMemory;
      }
    }

    const row = this.db
      .prepare(
        `SELECT symbol_key, explanation_type, content_hash, dependency_hash, model_name,
                provider_mode, prompt_version, content_json, created_at, source_code, incremental_depth
         FROM explanations
         WHERE symbol_key = ?
           AND content_hash = ?
           AND dependency_hash = ?
           AND model_name = ?
           AND provider_mode = ?
           AND prompt_version = ?`
      )
      .get(
        params.symbolKey,
        params.contentHash,
        params.dependencyHash,
        params.modelName,
        params.provider,
        params.promptVersion
      ) as Record<string, string | number | null> | undefined;

    if (!row) {
      return undefined;
    }

    const record = this.mapRowToRecord(row);

    if (this.isExpired(record.createdAt, ttlMs)) {
      this.deleteLookup(params);
      return undefined;
    }

    this.memoryCache.set(cacheKey, record);
    return record;
  }

  public save(explanation: StoredExplanation): void {
    this.memoryCache.set(this.buildLookupKey(explanation), explanation);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO explanations (
           symbol_key, explanation_type, content_hash, dependency_hash, model_name,
           provider_mode, prompt_version, content_json, created_at, source_code, incremental_depth
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        explanation.symbolKey,
        explanation.explanationType,
        explanation.contentHash,
        explanation.dependencyHash,
        explanation.modelName,
        explanation.provider,
        explanation.promptVersion,
        JSON.stringify(explanation.result),
        explanation.createdAt,
        explanation.sourceCode ?? null,
        explanation.incrementalDepth ?? 0
      );
  }

  public findLatestBySymbolKey(symbolKey: string): StoredExplanation | undefined {
    const row = this.db
      .prepare(
        `SELECT symbol_key, explanation_type, content_hash, dependency_hash, model_name,
                provider_mode, prompt_version, content_json, created_at, source_code, incremental_depth
         FROM explanations
         WHERE symbol_key = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(symbolKey) as Record<string, string | number | null> | undefined;

    if (!row) {
      return undefined;
    }
    return this.mapRowToRecord(row);
  }

  public invalidateSymbol(symbolKey: string): void {
    this.deleteMemoryEntries((entry) => entry.symbolKey === symbolKey);
    this.db
      .prepare(`DELETE FROM explanations WHERE symbol_key = ?`)
      .run(symbolKey);
    this.db
      .prepare(`DELETE FROM call_edges WHERE parent_symbol_key = ?`)
      .run(symbolKey);
  }

  public invalidateFile(filePath: string): void {
    this.deleteMemoryEntries((entry) => entry.symbolKey.includes(`::${filePath}::`));
    this.db
      .prepare(`DELETE FROM explanations WHERE symbol_key LIKE ?`)
      .run(`%::${filePath}::%`);
    this.db
      .prepare(`DELETE FROM call_edges WHERE child_file_path = ? OR parent_symbol_key LIKE ?`)
      .run(filePath, `%::${filePath}::%`);
  }

  public replaceCallEdges(symbolKey: string, callees: RelatedSymbol[]): void {
    this.db
      .prepare(`DELETE FROM call_edges WHERE parent_symbol_key = ?`)
      .run(symbolKey);

    const statement = this.db.prepare(
      `INSERT OR REPLACE INTO call_edges (
         parent_symbol_key, child_symbol_name, child_file_path, child_signature, discovered_at
       ) VALUES (?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();

    for (const callee of callees) {
      statement.run(symbolKey, callee.name, callee.filePath, callee.signature ?? null, now);
    }
  }

  public getCallEdges(symbolKey: string): RelatedSymbol[] {
    const rows = this.db
      .prepare(
        `SELECT child_symbol_name, child_file_path, child_signature
         FROM call_edges
         WHERE parent_symbol_key = ?`
      )
      .all(symbolKey) as Array<{
        child_symbol_name: string;
        child_file_path: string;
        child_signature: string | null;
      }>;

    return rows.map((row) => ({
      name: row.child_symbol_name,
      filePath: row.child_file_path,
      signature: row.child_signature ?? undefined
    }));
  }

  public getCacheStats(): { totalEntries: number; providers: Record<string, number> } {
    const rows = this.db
      .prepare(`SELECT provider_mode, COUNT(*) as cnt FROM explanations GROUP BY provider_mode`)
      .all() as Array<{ provider_mode: string; cnt: number }>;

    const providers: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      providers[row.provider_mode] = row.cnt;
      total += row.cnt;
    }
    return { totalEntries: total, providers };
  }

  private mapRowToRecord(row: Record<string, string | number | null>): StoredExplanation {
    return {
      symbolKey: row.symbol_key as string,
      explanationType: row.explanation_type as ExplanationAction,
      contentHash: row.content_hash as string,
      dependencyHash: row.dependency_hash as string,
      modelName: row.model_name as string,
      provider: row.provider_mode as StoredExplanation["provider"],
      promptVersion: row.prompt_version as string,
      result: JSON.parse(row.content_json as string),
      createdAt: row.created_at as string,
      sourceCode: (row.source_code as string) ?? undefined,
      incrementalDepth: typeof row.incremental_depth === "number" ? row.incremental_depth : 0
    };
  }

  private buildLookupKey(params: ExplanationLookup | StoredExplanation): string {
    return [
      params.symbolKey,
      params.contentHash,
      params.dependencyHash,
      params.modelName,
      params.provider,
      params.promptVersion
    ].join("::");
  }

  private isExpired(createdAt: string, ttlMs: number): boolean {
    if (ttlMs <= 0) {
      return false;
    }
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) {
      return false;
    }
    return Date.now() - createdAtMs > ttlMs;
  }

  private deleteLookup(params: ExplanationLookup): void {
    this.memoryCache.delete(this.buildLookupKey(params));
    this.db
      .prepare(
        `DELETE FROM explanations
         WHERE symbol_key = ?
           AND content_hash = ?
           AND dependency_hash = ?
           AND model_name = ?
           AND provider_mode = ?
           AND prompt_version = ?`
      )
      .run(
        params.symbolKey,
        params.contentHash,
        params.dependencyHash,
        params.modelName,
        params.provider,
        params.promptVersion
      );
  }

  private deleteMemoryEntries(predicate: (entry: StoredExplanation) => boolean): void {
    for (const [key, value] of this.memoryCache.entries()) {
      if (predicate(value)) {
        this.memoryCache.delete(key);
      }
    }
  }
}
