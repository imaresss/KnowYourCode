/**
 * Extension Detector — Layer 2 of the AI environment detection pipeline.
 *
 * Scans `vscode.extensions.all` in two passes:
 *
 *   1. Explicit allow-list  — checks against KNOWN_AI_EXTENSIONS by exact ID
 *      (case-insensitive), ordered by handoff capability (chat > completion).
 *
 *   2. Heuristic patterns   — regex-matches extension IDs, display names, and
 *      descriptions against AI-related keywords for forward-compatibility with
 *      extensions not yet in the allow-list.
 *
 * Both passes are synchronous and complete in < 5 ms even on machines with
 * 200+ extensions installed.
 */

import * as vscode from "vscode";
import type { AiExtensionDetectionResult, ChatStrategy } from "./types";

// ---------------------------------------------------------------------------
// Known extension registry
// ---------------------------------------------------------------------------

interface KnownAiExtensionDef {
  /** Lower-cased canonical extension ID, e.g. `"github.copilot-chat"`. */
  id: string;
  displayName: string;
  chatStrategy: ChatStrategy;
}

/**
 * Ordered from highest handoff priority to lowest.
 * When multiple AI extensions are detected the first item with an `isActive`
 * extension determines the primary chat strategy.
 */
const KNOWN_AI_EXTENSIONS: readonly KnownAiExtensionDef[] = [
  // ── Chat-capable extensions (best for programmatic handoff) ─────────────
  { id: "github.copilot-chat",              displayName: "GitHub Copilot Chat",       chatStrategy: "copilot"   },
  { id: "github.copilot",                   displayName: "GitHub Copilot",            chatStrategy: "copilot"   },
  { id: "continue.continue",                displayName: "Continue",                  chatStrategy: "continue"  },
  { id: "sourcegraph.cody-ai",              displayName: "Sourcegraph Cody",          chatStrategy: "cody"      },
  { id: "amazonwebservices.amazon-q-vscode",displayName: "Amazon Q",                  chatStrategy: "amazonq"   },

  // ── Completion-only AI extensions ───────────────────────────────────────
  { id: "codeium.codeium",                  displayName: "Codeium",                   chatStrategy: "generic"   },
  { id: "codeium.windsurf-nightly",         displayName: "Windsurf (Codeium nightly)",chatStrategy: "windsurf"  },
  { id: "tabnine.tabnine-vscode",           displayName: "Tabnine",                   chatStrategy: "clipboard" },
  { id: "visualstudioexptteam.vscodeintellicode", displayName: "IntelliCode",         chatStrategy: "clipboard" },

  // ── Agentic / code-gen tools ────────────────────────────────────────────
  { id: "rooveterinaryinc.roo-cline",       displayName: "Roo Code",                  chatStrategy: "generic"   },
  { id: "cline.cline",                      displayName: "Cline",                     chatStrategy: "generic"   },
  { id: "saoudrizwan.claude-dev",           displayName: "Claude Dev (Cline)",        chatStrategy: "generic"   },
  { id: "anysphere.cursor-retrieval",       displayName: "Cursor Retrieval",          chatStrategy: "cursor"    },
  { id: "codiumai.codiumai-vscode",         displayName: "CodiumAI",                  chatStrategy: "generic"   },

  // ── Misc AI assistants ──────────────────────────────────────────────────
  { id: "blackboxapp.blackbox",             displayName: "Blackbox AI",               chatStrategy: "generic"   },
  { id: "gencay1.codeai",                   displayName: "Code AI",                   chatStrategy: "generic"   },
  { id: "supermaven.supermaven",            displayName: "Supermaven",                chatStrategy: "clipboard" },
  { id: "mutable.ai",                       displayName: "Mutable AI",                chatStrategy: "generic"   },
  { id: "aws.toolkit",                      displayName: "AWS Toolkit (Q inline)",    chatStrategy: "amazonq"   },
  { id: "openai.openai-chatgpt-adhoc",      displayName: "ChatGPT (OpenAI)",          chatStrategy: "generic"   },
] as const;

// ---------------------------------------------------------------------------
// Heuristic patterns for forward-compatibility
// ---------------------------------------------------------------------------

/**
 * Patterns matched against a concatenation of extension ID + display name +
 * description (all lower-cased).  This catches future extensions not yet in
 * the explicit list above.
 */
const AI_HEURISTIC_PATTERNS: readonly RegExp[] = [
  /\bcopilot\b/,
  /\bcody\b/,
  /\btabnine\b/,
  /\bcodeium\b/,
  /\bcontinue\b/,
  /amazon[- ]?q\b/,
  /\bai[- ]?chat\b/,
  /\bai[- ]?assistant\b/,
  /\bai[- ]?autocomplete\b/,
  /\bai[- ]?coder\b/,
  /\bai[- ]?complete\b/,
  /\bllm\b/,
  /\bgenai\b/,
  /\bgpt[- ]?4?\b/,
  /\bopenai\b/,
  /\bclaude[- ]?ai\b/,
  /\bgemini[- ]?ai\b/,
  /\bintellicode\b/,
  /\bai[- ]?pair[- ]?programmer\b/,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns every AI-related extension found in the current VS Code installation.
 * Result is ordered: known high-priority extensions first, heuristic matches last.
 */
export function detectAiExtensions(): AiExtensionDetectionResult[] {
  const installed = vscode.extensions.all;
  const results: AiExtensionDetectionResult[] = [];
  const seenIds = new Set<string>();

  // Pass 1 — explicit allow-list (preserves priority ordering)
  for (const def of KNOWN_AI_EXTENSIONS) {
    const ext = installed.find((e) => e.id.toLowerCase() === def.id);
    if (ext && !seenIds.has(def.id)) {
      seenIds.add(def.id);
      results.push({
        id: ext.id,
        displayName: def.displayName,
        chatStrategy: def.chatStrategy,
        isActive: ext.isActive
      });
    }
  }

  // Pass 2 — heuristic pattern matching on everything else
  for (const ext of installed) {
    const lowerKey = ext.id.toLowerCase();
    if (seenIds.has(lowerKey)) {
      continue;
    }

    const pkg = ext.packageJSON as Record<string, unknown> | undefined;
    const searchTarget = [
      ext.id,
      (pkg?.displayName as string) ?? "",
      (pkg?.description as string) ?? ""
    ]
      .join(" ")
      .toLowerCase();

    if (AI_HEURISTIC_PATTERNS.some((re) => re.test(searchTarget))) {
      seenIds.add(lowerKey);
      results.push({
        id: ext.id,
        displayName: (pkg?.displayName as string) ?? ext.id,
        chatStrategy: "generic",
        isActive: ext.isActive
      });
    }
  }

  return results;
}

/**
 * Picks the best {@link ChatStrategy} from a list of detected extensions.
 *
 * Prefers *active* extensions over merely installed ones.  Within each group
 * the first item wins (list is already ordered by priority).
 *
 * Returns `null` when the list is empty.
 */
export function bestExtensionChatStrategy(
  extensions: AiExtensionDetectionResult[]
): ChatStrategy | null {
  if (extensions.length === 0) {
    return null;
  }

  const active = extensions.filter((e) => e.isActive);
  const pool = active.length > 0 ? active : extensions;
  return pool[0]!.chatStrategy;
}
