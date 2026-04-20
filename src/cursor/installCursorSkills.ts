import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { logInfo } from "../utils/logger";

const SKILL_DIRS = [
  "kyc-explain-function",
  "kyc-explain-callflow",
  "kyc-explain-selected",
  "kyc-generate-api-request"
] as const;

/**
 * Copies bundled SKILL.md files into ~/.cursor/skills/<name>/ so Cursor picks them up.
 * Safe to call on every activation: overwrites with the version shipped in the extension.
 */
export async function installBundledCursorSkills(context: vscode.ExtensionContext): Promise<void> {
  const bundledRoot = path.join(context.extensionPath, "skills");
  const cursorSkillsRoot = path.join(os.homedir(), ".cursor", "skills");

  for (const dir of SKILL_DIRS) {
    const src = path.join(bundledRoot, dir, "SKILL.md");
    const destDir = path.join(cursorSkillsRoot, dir);
    const dest = path.join(destDir, "SKILL.md");
    try {
      await fs.access(src);
    } catch {
      logInfo(`Bundled Cursor skill missing, skip: ${dir}`);
      continue;
    }
    try {
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(src, dest);
      logInfo(`Installed Cursor skill: ${dir}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logInfo(`Could not install Cursor skill ${dir}: ${msg}`);
    }
  }
}
