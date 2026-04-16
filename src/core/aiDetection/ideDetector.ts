/**
 * IDE Detector — Layer 1 of the AI environment detection pipeline.
 *
 * Identifies whether the host IDE is an AI-native fork of VS Code (Cursor,
 * Windsurf, Continue IDE, Replit, Void Editor …) by inspecting low-level
 * runtime signals:
 *
 *   • vscode.env.appName   — display name shown in the title bar
 *   • vscode.env.uriScheme — custom URI scheme registered by the IDE
 *   • process.execPath      — path to the host executable
 *   • process.argv[0]       — argv[0] of the host process
 *
 * All checks are synchronous and add zero latency to extension activation.
 */

import type { IdeDetectionSnapshot } from "../ideDetection";
import type { AiIdeDetectionResult, AiIdeKind, ChatStrategy } from "./types";

// ---------------------------------------------------------------------------
// Internal definition table
// ---------------------------------------------------------------------------

interface AiIdeDefinition {
  kind: AiIdeKind;
  displayName: string;
  /** Lower-cased substrings that identify this IDE in any of the runtime tokens. */
  fingerprints: readonly string[];
  chatStrategy: ChatStrategy;
}

/**
 * Ordered list of known AI-native IDEs.
 * Earlier entries take priority when multiple fingerprints match the same token.
 */
const AI_IDE_DEFINITIONS: readonly AiIdeDefinition[] = [
  {
    kind: "cursor",
    displayName: "Cursor",
    fingerprints: ["cursor"],
    chatStrategy: "cursor"
  },
  {
    kind: "windsurf",
    displayName: "Windsurf",
    // "codeium" appears in Windsurf's URI scheme and exec path
    fingerprints: ["windsurf", "codeium"],
    chatStrategy: "windsurf"
  },
  {
    kind: "antigravity",
    displayName: "Antigravity IDE",
    fingerprints: ["antigravity", "anti-gravity"],
    chatStrategy: "generic"
  },
  {
    kind: "continue_ide",
    displayName: "Continue IDE",
    fingerprints: ["continue-ide", "continuecode"],
    chatStrategy: "continue"
  },
  {
    kind: "replit",
    displayName: "Replit",
    fingerprints: ["replit"],
    chatStrategy: "generic"
  },
  {
    kind: "void_editor",
    displayName: "Void Editor",
    fingerprints: ["void-editor", "voideditor", "void"],
    chatStrategy: "generic"
  }
] as const;

const NOT_AI_IDE: AiIdeDetectionResult = {
  isAiIde: false,
  kind: "none",
  displayName: "None",
  chatStrategy: "clipboard"
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine whether the host IDE is a known AI-native environment.
 *
 * Pass in a snapshot from {@link getCurrentIdeSnapshot} so the function
 * remains pure and unit-testable without mocking `vscode`.
 */
export function detectAiIde(snapshot: IdeDetectionSnapshot): AiIdeDetectionResult {
  // Normalise all runtime tokens into a single lower-cased search space.
  const tokens = buildTokens(snapshot);

  for (const def of AI_IDE_DEFINITIONS) {
    const matched = def.fingerprints.some((fp) =>
      tokens.some((token) => token.includes(fp))
    );
    if (matched) {
      return {
        isAiIde: true,
        kind: def.kind,
        displayName: def.displayName,
        chatStrategy: def.chatStrategy
      };
    }
  }

  return NOT_AI_IDE;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTokens(snapshot: IdeDetectionSnapshot): string[] {
  return [
    snapshot.appName,
    snapshot.uriScheme,
    snapshot.execPath,
    snapshot.argv0
  ]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.trim().toLowerCase());
}
