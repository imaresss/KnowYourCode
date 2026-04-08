import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { LastActionRunner } from "../core/lastAction";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { formatExplanationMarkdown } from "../ui/formatter";
import { buildCodeReferenceMapForDocument } from "../core/codeReferences";

export function createRefreshExplanationCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel,
  getLastActionRunner: () => LastActionRunner | undefined
): () => Promise<void> {
  return async () => {
    const lastRunner = getLastActionRunner();
    if (lastRunner) {
      await lastRunner.rerun("regenerate");
      return;
    }

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
    const selection = await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model to regenerate ${context.symbolName}`
    });
    if (!selection) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: Re-generating explanation for ${context.symbolName}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.explainFunction(input, selection, { forceRefresh: true });
          void orchestrator.prefetchConnectedContexts(context, selection);
          const markdown = formatExplanationMarkdown(result, context.code, context.range.startLine);
          const references = await buildCodeReferenceMapForDocument(markdown, editor.document, {
            focusedRange: editor.selection,
            seedIdentifiers: [
              context.symbolName,
              ...context.callers.map((item) => item.name),
              ...context.callees.map((item) => item.name),
              ...context.nearbySymbols.map((item) => item.name)
            ]
          });
          panel.show(
            `KYC: ${context.symbolName} (refreshed)`,
            markdown,
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel,
              references
            }
          );
        } catch (error) {
          const friendly = formatProviderError(error, selection.provider);
          const fallback = buildFallbackExplanation(context, friendly);
          panel.show(
            `KYC: ${context.symbolName} (fallback)`,
            formatExplanationMarkdown(fallback, context.code, context.range.startLine),
            { provider: selection.providerLabel, modelName: selection.modelName, cacheHit: false }
          );
          void vscode.window.showWarningMessage(friendly);
        }
      }
    );
  };
}
