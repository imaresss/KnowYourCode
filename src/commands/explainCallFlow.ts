import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { buildContentHash, buildDependencyHash } from "../intelligence/fingerprint";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { formatCallFlowMarkdown, formatExplanationMarkdown } from "../ui/formatter";
import { ExplainCallFlowInput } from "../core/types";

export function createExplainCallFlowCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel
) {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to explain the call flow.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No enclosing function or symbol was found at the current cursor.");
      return;
    }

    const input: ExplainCallFlowInput = {
      workspaceRoot: context.workspaceRoot,
      filePath: context.filePath,
      language: context.language,
      symbolName: context.symbolName,
      symbolKind: context.symbolKind,
      code: context.code,
      callers: context.callers,
      callees: context.callees,
      contentHash: buildContentHash(context),
      dependencyHash: buildDependencyHash(context)
    };
    const selection = await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model to analyze ${context.symbolName}`
    });
    if (!selection) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: Analyzing call flow for ${context.symbolName}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.explainCallFlow(input, selection);
          const markdown = formatCallFlowMarkdown(result, context.symbolName);
          panel.show(
            `KYC: Call Flow — ${context.symbolName}${meta.cacheHit ? " (cached)" : ""}`,
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
