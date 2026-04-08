import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { LastActionRunner, RerunIntent } from "../core/lastAction";
import { SelectedModel } from "../core/types";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { formatExplanationMarkdown } from "../ui/formatter";
import { buildCodeReferenceMapForDocument } from "../core/codeReferences";

export function createExplainCurrentFunctionCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel,
  setLastActionRunner: (runner: LastActionRunner | undefined) => void
) {
  return async (options?: { forceRefresh?: boolean; selectionOverride?: SelectedModel }) => {
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
    const selection = options?.selectionOverride ?? await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model to explain ${context.symbolName}`
    });
    if (!selection) {
      return;
    }

    setLastActionRunner({
      rerun: async (intent: RerunIntent) => {
        const rerunSelection = intent === "switchModel"
          ? await modelSelector.pickModel({
            title: "KYC: Switch AI Model",
            placeHolder: `Choose a default model to re-explain ${context.symbolName}`,
            forcePrompt: true,
            persistAsDefault: true
          })
          : selection;
        if (!rerunSelection) {
          return;
        }
        await vscode.commands.executeCommand("knowYourCode.explainFunction", {
          forceRefresh: true,
          selectionOverride: rerunSelection
        });
      }
    });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: Explaining ${context.symbolName}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.explainFunction(input, selection, {
            forceRefresh: options?.forceRefresh
          });
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
            `KYC: ${context.symbolName}${meta.cacheHit ? " (cached)" : ""}`,
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
            {
              provider: selection.providerLabel,
              modelName: selection.modelName,
              cacheHit: false
            }
          );
          void vscode.window.showWarningMessage(friendly);
        }
      }
    );
  };
}
