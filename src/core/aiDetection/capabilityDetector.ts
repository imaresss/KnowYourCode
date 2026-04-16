/**
 * Capability Detector — Layer 3 of the AI environment detection pipeline.
 *
 * Interrogates the VS Code Language Model API (`vscode.lm`) introduced in
 * VS Code 1.90 to discover whether any LLM chat models are currently
 * registered.  This is the most authoritative signal: if a model is registered
 * it means an AI provider (Copilot, Continue, Cody …) is fully loaded and
 * ready, not just installed.
 *
 * The call to `vscode.lm.selectChatModels` is a local registry lookup —
 * it does NOT make any network requests or trigger authentication dialogs.
 * It reliably completes within a few milliseconds.
 */

import * as vscode from "vscode";
import type { AiCapabilityResult } from "./types";

const DETECTION_TIMEOUT_MS = 2_000;

/**
 * Probes the VS Code Language Model API for registered chat models.
 *
 * Always resolves (never rejects).  Returns zeroed-out result on any error
 * so the caller can treat a failed probe as "no AI capability" rather than
 * a hard failure.
 */
export async function detectAiCapabilities(): Promise<AiCapabilityResult> {
  try {
    // Wrap the VS Code Thenable in a real Promise so we can race it with a
    // timeout.  `vscode.lm.selectChatModels` queries a local registry and
    // does not make network requests, so 2 s is a very generous ceiling.
    const modelsPromise = new Promise<vscode.LanguageModelChat[]>((resolve, reject) => {
      vscode.lm.selectChatModels({}).then(resolve, reject);
    });

    const timeoutPromise = new Promise<vscode.LanguageModelChat[]>((_, reject) =>
      setTimeout(
        () => reject(new Error(`detectAiCapabilities timed out after ${DETECTION_TIMEOUT_MS} ms`)),
        DETECTION_TIMEOUT_MS
      )
    );

    const models = await Promise.race([modelsPromise, timeoutPromise]);

    return {
      hasLanguageModelApi: true,
      registeredModelCount: models.length
    };
  } catch {
    // vscode.lm unavailable, timed out, or threw — treat as no AI capability.
    return {
      hasLanguageModelApi: false,
      registeredModelCount: 0
    };
  }
}
