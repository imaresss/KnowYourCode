import * as vscode from "vscode";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { ExplanationPanel } from "../ui/panel";
import { buildContextActionPrompt, KycActionId } from "../context/actionRegistry";
import { resolveInteractionContext } from "../context/interactionContext";
import { formatProviderError } from "../core/providerErrors";
import { ModelSelectionService } from "../providers/modelSelector";

export function createRunContextActionCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel
) {
  return async (actionId: KycActionId) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to use KYC actions.");
      return;
    }

    const context = await resolveInteractionContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No valid KYC context was found at the current cursor or selection.");
      return;
    }

    const prompt = buildContextActionPrompt(actionId, context);
    const selection = await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model for ${actionLabel(actionId)}`
    });
    if (!selection) {
      return;
    }

    panel.showLoading(`KYC: ${actionLabel(actionId)}`, selection.providerLabel, selection.modelName);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: ${actionLabel(actionId)}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.runContextAction({
            actionId,
            key: context.key,
            contentHash: context.contentHash,
            dependencyHash: context.dependencyHash,
            prompt,
            selection
          });

          panel.show(
            `KYC: ${actionLabel(actionId)}`,
            result.markdown,
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel
            }
          );
        } catch (error) {
          const friendly = formatProviderError(error, selection.provider);
          panel.show(
            `KYC: ${actionLabel(actionId)} (error)`,
            `# ${actionLabel(actionId)}\n\n${friendly}`,
            { provider: selection.providerLabel, modelName: selection.modelName, cacheHit: false }
          );
          void vscode.window.showWarningMessage(friendly);
        }
      }
    );
  };
}

function actionLabel(actionId: KycActionId): string {
  switch (actionId) {
    case "explainSelectedCode":
      return "Explain Selected Code";
    case "explainLineByLine":
      return "Explain Line-by-Line";
    case "summarizeSelection":
      return "Summarize Selection";
    case "findIssues":
      return "Find Issues / Improvements";
    case "optimizeFunction":
      return "Optimize Function";
  }
}
