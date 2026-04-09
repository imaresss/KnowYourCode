import * as vscode from "vscode";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { LastActionRunner, RerunIntent } from "../core/lastAction";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { formatLineExplanationMarkdown } from "../ui/formatter";
import { ExplainLineInput, SelectedModel } from "../core/types";
import { sha256 } from "../utils/hash";
import { buildCodeReferenceMapForDocument } from "../core/codeReferences";
import { getTutorialRecommendations } from "../tutorials/recommendations";

export function createExplainCurrentLineCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel,
  setLastActionRunner: (runner: LastActionRunner | undefined) => void
) {
  return async (options?: { forceRefresh?: boolean; selectionOverride?: SelectedModel }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const lineNumber = editor.selection.active.line + 1;
    const lineText = editor.document.lineAt(editor.selection.active.line).text.trim();

    if (!lineText) {
      void vscode.window.showInformationMessage("The current line is empty.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    const enclosingCode = context?.code ?? editor.document.getText();
    const enclosingName = context?.symbolName ?? "file scope";
    const imports = context?.imports ?? [];

    const input: ExplainLineInput = {
      filePath: editor.document.uri.fsPath,
      language: editor.document.languageId,
      lineText,
      lineNumber,
      enclosingSymbolName: enclosingName,
      enclosingCode,
      imports,
      contentHash: sha256(lineText)
    };
    const selection = options?.selectionOverride ?? await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model to explain line ${lineNumber}`
    });
    if (!selection) {
      return;
    }

    setLastActionRunner({
      rerun: async (intent: RerunIntent) => {
        const rerunSelection = intent === "switchModel"
          ? await modelSelector.pickModel({
            title: "KYC: Switch AI Model",
            placeHolder: `Choose a default model to re-explain line ${lineNumber}`,
            forcePrompt: true,
            persistAsDefault: true
          })
          : selection;
        if (!rerunSelection) {
          return;
        }
        await vscode.commands.executeCommand("knowYourCode.explainLine", {
          forceRefresh: true,
          selectionOverride: rerunSelection
        });
      }
    });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: Explaining line ${lineNumber}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.explainLine(input, selection, {
            forceRefresh: options?.forceRefresh
          });
          const markdown = formatLineExplanationMarkdown(result, lineText, lineNumber, enclosingName);
          const tutorials = await getTutorialRecommendations(enclosingCode, input.language);
          const references = await buildCodeReferenceMapForDocument(markdown, editor.document, {
            focusedRange: editor.selection,
            seedIdentifiers: [enclosingName]
          });
          panel.show(
            `KYC: Line ${lineNumber}${meta.cacheHit ? " (cached)" : ""}`,
            markdown,
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel,
              references,
              tutorials,
              tokenUsage: meta.tokenUsage
            }
          );
        } catch (error) {
          const friendly = formatProviderError(error, selection.provider);
          panel.show(
            `KYC: Line ${lineNumber} (error)`,
            `# Line Explanation Failed\n\n\`${lineText}\`\n\n${friendly}`,
            { provider: selection.providerLabel, modelName: selection.modelName, cacheHit: false }
          );
          void vscode.window.showWarningMessage(friendly);
        }
      }
    );
  };
}
