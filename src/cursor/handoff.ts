/**
 * AI Chat Handoff — delivers a KYC-generated prompt to the user's active AI
 * assistant, opening the appropriate chat panel automatically.
 *
 * Strategy resolution is fully automatic (see `src/core/aiDetection/`).
 * The public function names are intentionally kept stable so the four
 * command files that import them need no changes.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  Strategy      │  Delivery method                             │
 * ├────────────────────────────────────────────────────────────────┤
 * │  copilot       │  workbench.action.chat.open { query } →      │
 * │                │  auto-submits in VS Code ≥ 1.96              │
 * ├────────────────────────────────────────────────────────────────┤
 * │  cursor        │  composer.newAgentChat → clipboard paste      │
 * │  windsurf      │  windsurf chat commands → clipboard paste     │
 * │  continue      │  continue.focusContinueInput → paste         │
 * │  cody          │  cody.chat.new → clipboard paste             │
 * │  amazonq       │  aws.amazonq.chat.focus → clipboard paste     │
 * │  generic       │  workbench.action.chat.open { query } or     │
 * │                │  clipboard paste fallback                    │
 * ├────────────────────────────────────────────────────────────────┤
 * │  clipboard     │  copy only — no chat panel opened            │
 * └────────────────────────────────────────────────────────────────┘
 */

import * as vscode from "vscode";
import { getConfig } from "../core/config";
import { getBestChatStrategy } from "../core/aiDetection";
import { logInfo } from "../utils/logger";
import type { ChatStrategy } from "../core/aiDetection";

// ---------------------------------------------------------------------------
// Command tables — ordered most-to-least likely to succeed
// ---------------------------------------------------------------------------

/**
 * Commands tried (in order) to open the AI chat panel for each strategy.
 * An empty array means "skip opening — clipboard only".
 */
const STRATEGY_OPEN_COMMANDS: Readonly<Record<ChatStrategy, readonly string[]>> = {
  cursor: [
    "composer.newAgentChat",
    "aichat.newchat",
    "cursor.openCursorChat",
    "workbench.action.chat.open"
  ],
  windsurf: [
    "windsurf.openChat",
    "codeium.openChat",
    "composer.newAgentChat",
    "workbench.action.chat.open"
  ],
  copilot: [
    // Fallback when workbench.action.chat.open { query } (Path A) is unsupported:
    // open the panel without args, then paste from clipboard.
    "workbench.action.chat.open",
    "workbench.action.chat.focus",
    "workbench.panel.chat.view.copilot.focus"
  ],
  continue: [
    "continue.focusContinueInput",
    "continue.continueGUIView.focus",
    "workbench.action.chat.open"
  ],
  cody: [
    "cody.chat.new",
    "cody.focus",
    "workbench.action.chat.open"
  ],
  amazonq: [
    "aws.amazonq.chat.focus",
    "aws.amazonq.explainCode",
    "workbench.action.chat.open"
  ],
  generic: [
    // Fallback when workbench.action.chat.open { query } (Path A) is unsupported:
    // open the panel without args, then paste from clipboard.
    "workbench.action.chat.open",
    "workbench.action.chat.focus"
  ],
  clipboard: []
};

/**
 * Strategies for which VS Code's `workbench.action.chat.open { query }` is
 * tried first.  This auto-submits the prompt in VS Code ≥ 1.96, giving the
 * best possible UX without any manual copy-paste.
 */
const AUTO_SUBMIT_STRATEGIES = new Set<ChatStrategy>(["copilot", "generic"]);

// ---------------------------------------------------------------------------
// Public API (names kept stable for backward-compat with command imports)
// ---------------------------------------------------------------------------

/**
 * Routes a KYC prompt to the best available AI chat panel.
 *
 * Returns `true` when the clipboard was written successfully (always).
 * Internally dispatches to the appropriate strategy based on what AI
 * environment was detected at extension activation.
 */
export async function handoffToCursorChat(
  prompt: string,
  label: string
): Promise<boolean> {
  const strategy = getBestChatStrategy();
  logInfo(`[AI Handoff] Delivering "${label}" via strategy: ${strategy}`);
  return executeHandoff(prompt, label, strategy);
}

/**
 * Returns `true` when AI handoff is enabled (auto-detected or user-forced).
 * Reads from the live `cursorHandoff` config key which itself is backed by
 * the AI detection cache — fully transparent to callers.
 */
export function isCursorHandoffEnabled(): boolean {
  return getConfig().cursorHandoff;
}

// ---------------------------------------------------------------------------
// Core handoff execution
// ---------------------------------------------------------------------------

async function executeHandoff(
  prompt: string,
  label: string,
  strategy: ChatStrategy
): Promise<boolean> {
  // ── Path A: auto-submit via VS Code native chat query argument ────────────
  if (AUTO_SUBMIT_STRATEGIES.has(strategy)) {
    const submitted = await tryNativeChatAutoSubmit(prompt);
    if (submitted) {
      logInfo(`[AI Handoff] Auto-submitted to VS Code chat (${strategy})`);
      void vscode.window.showInformationMessage(
        `KYC: ${label} — sent to AI Chat.`
      );
      return true;
    }
    // Fall through to clipboard approach if native chat is unavailable.
    logInfo(
      `[AI Handoff] workbench.action.chat.open unavailable; ` +
      `falling back to clipboard for ${strategy}`
    );
  }

  // ── Path B: open chat panel → paste from clipboard ────────────────────────
  await vscode.env.clipboard.writeText(prompt);

  if (strategy === "clipboard") {
    notify(label, "copied to clipboard. Open an AI Chat and paste to send.");
    return true;
  }

  const opened = await tryOpenChatPanel(strategy);

  if (opened) {
    const pasted = await tryClipboardPaste();
    if (pasted) {
      notify(label, "pasted into Chat — press Enter to send.");
    } else {
      notify(label, "copied — paste (Cmd+V / Ctrl+V) into Chat and send.");
    }
  } else {
    notify(
      label,
      "copied to clipboard. Open the AI Chat panel, paste, and send."
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sub-steps
// ---------------------------------------------------------------------------

/**
 * Attempts to open VS Code's built-in chat panel with the prompt pre-filled
 * AND auto-submitted.  Works reliably with GitHub Copilot Chat in VS Code ≥ 1.96.
 */
async function tryNativeChatAutoSubmit(prompt: string): Promise<boolean> {
  try {
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query: prompt,
      isPartialQuery: false
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Tries each command in the strategy's open-command list, stopping at the
 * first one that executes without throwing.
 */
async function tryOpenChatPanel(strategy: ChatStrategy): Promise<boolean> {
  const commands = STRATEGY_OPEN_COMMANDS[strategy];
  for (const cmd of commands) {
    try {
      await vscode.commands.executeCommand(cmd);
      logInfo(`[AI Handoff] Chat panel opened via: ${cmd}`);
      return true;
    } catch {
      // Command not registered in this host — try the next one.
    }
  }

  // Some VS Code forks (for example Antigravity) register custom command IDs
  // for their AI chat. For the generic strategy, discover likely chat-open
  // commands dynamically and try them before giving up.
  if (strategy === "generic") {
    const discovered = await discoverGenericChatOpenCommands();
    for (const cmd of discovered) {
      try {
        await vscode.commands.executeCommand(cmd);
        logInfo(`[AI Handoff] Chat panel opened via discovered command: ${cmd}`);
        return true;
      } catch {
        // Keep trying remaining discovered commands.
      }
    }
  }

  return false;
}

/**
 * Waits briefly for the chat input to gain focus, then pastes the clipboard.
 */
async function tryClipboardPaste(): Promise<boolean> {
  try {
    // Allow enough time for the chat panel to open and its input to focus.
    await delay(500);
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function notify(label: string, suffix: string): void {
  void vscode.window.showInformationMessage(`KYC: ${label} — prompt ${suffix}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discoverGenericChatOpenCommands(): Promise<string[]> {
  try {
    const all = await vscode.commands.getCommands(true);
    const candidates = all.filter((cmd) => {
      const lower = cmd.toLowerCase();
      const hasChat = lower.includes("chat");
      const looksLikeOpen = lower.includes("open") || lower.includes("focus") || lower.includes("new");
      const hasAiContext =
        lower.includes("ai") ||
        lower.includes("assistant") ||
        lower.includes("copilot") ||
        lower.includes("codeium") ||
        lower.includes("windsurf") ||
        lower.includes("cursor") ||
        lower.includes("antigravity");
      return hasChat && looksLikeOpen && hasAiContext;
    });

    // Prefer likely non-default host commands first, then broad VS Code-ish ones.
    return candidates.sort((a, b) => scoreDiscoveredChatCommand(b) - scoreDiscoveredChatCommand(a));
  } catch {
    return [];
  }
}

function scoreDiscoveredChatCommand(commandId: string): number {
  const lower = commandId.toLowerCase();
  let score = 0;
  if (lower.includes("antigravity")) {
    score += 10;
  }
  if (lower.includes("open")) {
    score += 4;
  }
  if (lower.includes("focus")) {
    score += 3;
  }
  if (lower.includes("new")) {
    score += 2;
  }
  if (lower.includes("chat")) {
    score += 2;
  }
  if (lower.startsWith("workbench.")) {
    score -= 1;
  }
  return score;
}
