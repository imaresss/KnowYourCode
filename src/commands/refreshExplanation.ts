import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { getConfig } from "../core/config";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { ExplanationPanel } from "../ui/panel";
import { formatExplanationMarkdown } from "../ui/formatter";

export function createRefreshExplanationCommand(
  orchestrator: ExplanationOrchestrator,
  panel: ExplanationPanel
): () => Promise<void> {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to refresh the current function explanation.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No enclosing function or symbol was found at the current cursor.");
      return;
    }

    const input = buildExplainFunctionInput(context);
    try {
      const { result } = await orchestrator.explainFunction(input, { forceRefresh: true });
      void orchestrator.prefetchConnectedContexts(context);
      panel.show(`Know Your Code: ${context.symbolName} (refreshed)`, formatExplanationMarkdown(result));
    } catch (error) {
      const friendly = formatProviderError(error, getConfig().providerMode);
      const fallback = buildFallbackExplanation(context, friendly);
      panel.show(`Know Your Code: ${context.symbolName} (fallback refresh)`, formatExplanationMarkdown(fallback));
      void vscode.window.showWarningMessage(friendly);
    }
  };
}
