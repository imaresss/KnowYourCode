/**
 * Handoff Resolver — central orchestrator of the AI detection pipeline.
 *
 * This module owns a module-level singleton that holds the most recent
 * {@link HandoffResolution}.  Callers that need a synchronous answer (e.g.
 * `getConfig()`) read from the singleton via {@link isAiHandoffEnabled}.
 * The async refresh path is only entered during extension activation and
 * whenever `vscode.extensions.onDidChange` fires.
 *
 * Usage:
 *
 *   // extension.ts — before getConfig()
 *   await initHandoffDetection(context);
 *
 *   // config.ts — synchronous, always safe after init
 *   const handoff = isAiHandoffEnabled();
 *
 *   // extension.ts — subscribe to extension changes
 *   vscode.extensions.onDidChange(() => invalidateAndRefresh());
 */

import * as vscode from "vscode";
import { logInfo } from "../../utils/logger";
import { getCurrentIdeSnapshot } from "../ide";
import { detectAiIde } from "./ideDetector";
import { detectAiExtensions, bestExtensionChatStrategy } from "./extensionDetector";
import { detectAiCapabilities } from "./capabilityDetector";
import { getStoredResolution, storeResolution } from "./cache";
import type { ChatStrategy, HandoffResolution } from "./types";

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _context: vscode.ExtensionContext | undefined;
let _resolution: HandoffResolution | undefined;

// ---------------------------------------------------------------------------
// Initialisation (called once at extension activation)
// ---------------------------------------------------------------------------

/**
 * Runs a full AI environment detection and caches the result.
 *
 * Must be awaited **before** calling {@link isAiHandoffEnabled} for the first
 * time (typically the very first thing in `activate()` after installing
 * Cursor skills).
 *
 * If a stored resolution exists from the previous session it is used as an
 * optimistic starting value while fresh detection runs, ensuring
 * {@link isAiHandoffEnabled} never returns `undefined`.
 */
export async function initHandoffDetection(
  context: vscode.ExtensionContext
): Promise<void> {
  _context = context;

  // Seed with persisted value so sync reads during the async phase are coherent.
  const stored = getStoredResolution(context);
  if (stored) {
    _resolution = stored;
  }

  _resolution = await runDetection();
  await storeResolution(context, _resolution);

  logResolution(_resolution, "init");
}

// ---------------------------------------------------------------------------
// Sync accessors (safe to call after initHandoffDetection resolves)
// ---------------------------------------------------------------------------

/**
 * Returns `true` when any AI capability was detected (AI IDE, AI extension,
 * or registered LM API model).
 *
 * Falls back to `false` when called before {@link initHandoffDetection}
 * completes (this should not happen in normal usage).
 */
export function isAiHandoffEnabled(): boolean {
  return _resolution?.enabled ?? false;
}

/** Returns the full resolution object for logging / diagnostics. */
export function getHandoffResolution(): HandoffResolution | undefined {
  return _resolution;
}

/**
 * Returns the best {@link ChatStrategy} for delivering prompts to the
 * detected AI assistant.  Defaults to `"clipboard"` when no AI is detected.
 */
export function getBestChatStrategy(): ChatStrategy {
  return _resolution?.primaryStrategy ?? "clipboard";
}

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

/**
 * Re-runs the full detection and updates the singleton + globalState cache.
 *
 * Call this whenever `vscode.extensions.onDidChange` fires so that newly
 * installed / uninstalled AI extensions are reflected immediately.
 */
export async function invalidateAndRefresh(): Promise<void> {
  _resolution = await runDetection();

  if (_context) {
    await storeResolution(_context, _resolution);
  }

  logResolution(_resolution, "refresh");
}

// ---------------------------------------------------------------------------
// Detection engine (private)
// ---------------------------------------------------------------------------

async function runDetection(): Promise<HandoffResolution> {
  const start = Date.now();

  // --- Layer 1: IDE fingerprint detection (sync, ~0 ms) -------------------
  const snapshot = getCurrentIdeSnapshot();
  const ideDetection = detectAiIde(snapshot);

  // --- Layer 2: Installed extension scanning (sync, ~1-5 ms) --------------
  const extensions = detectAiExtensions();

  // --- Layer 3: VS Code LM API capability check (async, ~1-10 ms) ---------
  const capabilities = await detectAiCapabilities();

  // --- Aggregate signals ---------------------------------------------------
  const reasons: string[] = [];
  let enabled = false;
  let primaryStrategy: ChatStrategy = "clipboard";

  if (ideDetection.isAiIde) {
    enabled = true;
    reasons.push(`AI IDE: ${ideDetection.displayName}`);
    primaryStrategy = ideDetection.chatStrategy;
  }

  if (extensions.length > 0) {
    enabled = true;
    const extNames = extensions.map((e) => e.displayName).join(", ");
    reasons.push(`AI extension(s): ${extNames}`);

    // IDE strategy takes priority; only use extension strategy as fallback.
    if (primaryStrategy === "clipboard") {
      const extStrategy = bestExtensionChatStrategy(extensions);
      if (extStrategy) {
        primaryStrategy = extStrategy;
      }
    }
  }

  if (capabilities.registeredModelCount > 0) {
    enabled = true;
    reasons.push(
      `LM API: ${capabilities.registeredModelCount} registered model(s)`
    );
    // LM API with no better strategy → use VS Code native generic chat
    if (primaryStrategy === "clipboard") {
      primaryStrategy = "generic";
    }
  }

  return {
    enabled,
    reasons,
    primaryStrategy,
    detectedAiIde: ideDetection.isAiIde ? ideDetection : null,
    detectedExtensions: extensions,
    capabilities,
    detectedAt: Date.now(),
    detectionMs: Date.now() - start
  };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logResolution(resolution: HandoffResolution, phase: string): void {
  const strategyTag = resolution.enabled
    ? `strategy=${resolution.primaryStrategy}`
    : "no AI detected";

  logInfo(
    `[AI Handoff][${phase}] enabled=${resolution.enabled} ${strategyTag} ` +
    `(${resolution.detectionMs} ms)` +
    (resolution.reasons.length > 0
      ? ` — ${resolution.reasons.join(" | ")}`
      : "")
  );
}
