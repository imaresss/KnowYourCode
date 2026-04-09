import { Database } from "./db";
import { TutorialRecommendation } from "../tutorials/recommendations";

export class TutorialRepository {
  public constructor(private readonly db: Database) {}

  public find(codeHash: string, language: string): TutorialRecommendation[] | undefined {
    const row = this.db
      .prepare(
        `SELECT tutorials_json FROM tutorial_cache
         WHERE code_hash = ? AND language = ?`
      )
      .get(codeHash, language) as { tutorials_json: string } | undefined;

    if (!row) {
      return undefined;
    }
    try {
      return JSON.parse(row.tutorials_json) as TutorialRecommendation[];
    } catch {
      return undefined;
    }
  }

  public save(codeHash: string, language: string, tutorials: TutorialRecommendation[]): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO tutorial_cache (code_hash, language, tutorials_json, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(codeHash, language, JSON.stringify(tutorials), new Date().toISOString());
  }

  public invalidateByHash(codeHash: string): void {
    this.db
      .prepare(`DELETE FROM tutorial_cache WHERE code_hash = ?`)
      .run(codeHash);
  }

  public getStats(): { totalEntries: number; languages: Record<string, number> } {
    const rows = this.db
      .prepare(`SELECT language, COUNT(*) as cnt FROM tutorial_cache GROUP BY language`)
      .all() as Array<{ language: string; cnt: number }>;

    const languages: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      languages[row.language] = row.cnt;
      total += row.cnt;
    }
    return { totalEntries: total, languages };
  }
}
