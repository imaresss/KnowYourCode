/**
 * Shared types for the AI environment detection subsystem.
 *
 * Keep all cross-cutting types here to avoid circular imports between the
 * individual detector modules and the central handoffResolver.
 */

// ---------------------------------------------------------------------------
// Chat strategy
// ---------------------------------------------------------------------------

/**
 * Identifies how KYC will open the AI chat panel and deliver the prompt.
 *
 * - `cursor`    — Cursor Composer commands, clipboard-paste approach
 * - `windsurf`  — Windsurf / Codeium chat commands, clipboard-paste
 * - `copilot`   — GitHub Copilot Chat; uses VS Code's `workbench.action.chat.open`
 *                 with a `query` argument that auto-submits (VS Code ≥ 1.96)
 * - `continue`  — Continue extension; focuses the Continue input panel
 * - `cody`      — Sourcegraph Cody; opens Cody chat panel
 * - `amazonq`   — Amazon Q; focuses the Q chat view
 * - `generic`   — Any VS Code-native chat panel (fallback for unknown providers)
 * - `clipboard` — No chat panel can be opened; prompt is only copied to clipboard
 */
export type ChatStrategy =
  | "cursor"
  | "windsurf"
  | "copilot"
  | "continue"
  | "cody"
  | "amazonq"
  | "generic"
  | "clipboard";

// ---------------------------------------------------------------------------
// Detector result types
// ---------------------------------------------------------------------------

export type AiIdeKind =
  | "cursor"
  | "windsurf"
  | "antigravity"
  | "continue_ide"
  | "replit"
  | "void_editor"
  | "none";

export interface AiIdeDetectionResult {
  isAiIde: boolean;
  kind: AiIdeKind;
  displayName: string;
  chatStrategy: ChatStrategy;
}

export interface AiExtensionDetectionResult {
  /** The fully-qualified VS Code extension identifier, e.g. `"github.copilot"`. */
  id: string;
  displayName: string;
  chatStrategy: ChatStrategy;
  /** True if the extension is currently activated (not just installed). */
  isActive: boolean;
}

export interface AiCapabilityResult {
  /** True when `vscode.lm` is present and at least one chat model is registered. */
  hasLanguageModelApi: boolean;
  /** Number of language models registered via the VS Code LM API. */
  registeredModelCount: number;
}

// ---------------------------------------------------------------------------
// Aggregate resolution
// ---------------------------------------------------------------------------

export interface HandoffResolution {
  /** Whether AI handoff should be enabled based on all signals combined. */
  enabled: boolean;
  /** Human-readable list of reasons that led to the `enabled` decision. */
  reasons: string[];
  /** The best chat delivery strategy derived from the detected AI environment. */
  primaryStrategy: ChatStrategy;
  /** Non-null when the host IDE was identified as an AI-native IDE. */
  detectedAiIde: AiIdeDetectionResult | null;
  /** All AI-related VS Code extensions found in the installation. */
  detectedExtensions: AiExtensionDetectionResult[];
  /** VS Code Language Model API capability snapshot. */
  capabilities: AiCapabilityResult;
  /** Unix timestamp (ms) of when this resolution was computed. */
  detectedAt: number;
  /** Wall-clock time (ms) the full detection run took. */
  detectionMs: number;
}
