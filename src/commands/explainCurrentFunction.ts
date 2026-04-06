import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { getConfig } from "../core/config";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { ExplanationPanel } from "../ui/panel";
import { formatExplanationMarkdown } from "../ui/formatter";

export function createExplainCurrentFunctionCommand(
  orchestrator: ExplanationOrchestrator,
  panel: ExplanationPanel
) {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to explain the current function.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No enclosing function or symbol was found at the current cursor.");
      return;
    }

    const input = buildExplainFunctionInput(context);
    try {
      const { result, cacheHit } = await orchestrator.explainFunction(input);
      void orchestrator.prefetchConnectedContexts(context);
      const markdown = formatExplanationMarkdown(result);
      panel.show(
        `Know Your Code: ${context.symbolName}${cacheHit ? " (cached)" : ""}`,
        markdown
      );
    } catch (error) {
      const friendly = formatProviderError(error, getConfig().providerMode);
      const fallback = buildFallbackExplanation(context, friendly);
      panel.show(
        `Know Your Code: ${context.symbolName} (fallback)`,
        formatExplanationMarkdown(fallback)
      );
      void vscode.window.showWarningMessage(friendly);
    }
  };
}
