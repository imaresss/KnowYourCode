import { Database } from "./db";
import { ExplainFunctionResult, RelatedSymbol, StoredExplanation } from "../core/types";

export class ExplanationRepository {
  public constructor(private readonly db: Database) {}

  public findValid(params: {
    symbolKey: string;
    contentHash: string;
    dependencyHash: string;
    modelName: string;
    providerMode: string;
    promptVersion: string;
  }): StoredExplanation | undefined {
    const row = this.db
      .prepare(
        `SELECT symbol_key, explanation_type, content_hash, dependency_hash, model_name,
                provider_mode, prompt_version, content_json, created_at
         FROM explanations
         WHERE symbol_key = ?
           AND explanation_type = 'function'
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
        params.providerMode,
        params.promptVersion
      ) as
      | {
          symbol_key: string;
          explanation_type: "function";
          content_hash: string;
          dependency_hash: string;
          model_name: string;
          provider_mode: "local" | "cloud";
          prompt_version: string;
          content_json: string;
          created_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      symbolKey: row.symbol_key,
      explanationType: row.explanation_type,
      contentHash: row.content_hash,
      dependencyHash: row.dependency_hash,
      modelName: row.model_name,
      providerMode: row.provider_mode,
      promptVersion: row.prompt_version,
      result: JSON.parse(row.content_json) as ExplainFunctionResult,
      createdAt: row.created_at
    };
  }

  public save(explanation: StoredExplanation): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO explanations (
           symbol_key, explanation_type, content_hash, dependency_hash, model_name,
           provider_mode, prompt_version, content_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        explanation.symbolKey,
        explanation.explanationType,
        explanation.contentHash,
        explanation.dependencyHash,
        explanation.modelName,
        explanation.providerMode,
        explanation.promptVersion,
        JSON.stringify(explanation.result),
        explanation.createdAt
      );
  }

  public invalidateSymbol(symbolKey: string): void {
    this.db
      .prepare(`DELETE FROM explanations WHERE symbol_key = ?`)
      .run(symbolKey);
    this.db
      .prepare(`DELETE FROM call_edges WHERE parent_symbol_key = ?`)
      .run(symbolKey);
  }

  public invalidateFile(filePath: string): void {
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
      statement.run(
        symbolKey,
        callee.name,
        callee.filePath,
        callee.signature ?? null,
        now
      );
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
}
