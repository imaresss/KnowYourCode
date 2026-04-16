/**
 * globalState-backed cache for the AI handoff resolution.
 *
 * Detection results are persisted across VS Code restarts so that on the next
 * session the sync accessor (`isAiHandoffEnabled`) returns a meaningful value
 * immediately — before the async re-detection completes.
 *
 * Cache entries are unconditionally refreshed on every activation and on every
 * `vscode.extensions.onDidChange` event, so staleness is only ever one session
 * old at worst.
 */

import * as vscode from "vscode";
import type { HandoffResolution } from "./types";

const STATE_KEY = "kyc.aiHandoffResolution.v1";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the last stored resolution, or `null` if none exists yet. */
export function getStoredResolution(
  context: vscode.ExtensionContext
): HandoffResolution | null {
  return context.globalState.get<HandoffResolution>(STATE_KEY) ?? null;
}

/** Persists a resolution so it survives VS Code restarts. */
export async function storeResolution(
  context: vscode.ExtensionContext,
  resolution: HandoffResolution
): Promise<void> {
  await context.globalState.update(STATE_KEY, resolution);
}

/** Removes any stored resolution (e.g. for testing or explicit reset). */
export async function clearStoredResolution(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.globalState.update(STATE_KEY, undefined);
}
