import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { formatExplanationMarkdown } from "../ui/formatter";

export function createExplainCurrentFunctionCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
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
    const selection = await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model to explain ${context.symbolName}`
    });
    if (!selection) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: Explaining ${context.symbolName}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.explainFunction(input, selection);
          void orchestrator.prefetchConnectedContexts(context, selection);
          const markdown = formatExplanationMarkdown(result);
          panel.show(
            `KYC: ${context.symbolName}${meta.cacheHit ? " (cached)" : ""}`,
            markdown,
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel
            }
          );
        } catch (error) {
          const friendly = formatProviderError(error, selection.provider);
          const fallback = buildFallbackExplanation(context, friendly);
          panel.show(
            `KYC: ${context.symbolName} (fallback)`,
            formatExplanationMarkdown(fallback),
            { provider: selection.providerLabel, modelName: selection.modelName, cacheHit: false }
          );
          void vscode.window.showWarningMessage(friendly);
        }
      }
    );
  };
}
