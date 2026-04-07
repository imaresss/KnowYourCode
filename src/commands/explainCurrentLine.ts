import * as vscode from "vscode";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { formatLineExplanationMarkdown } from "../ui/formatter";
import { ExplainLineInput } from "../core/types";
import { sha256 } from "../utils/hash";

export function createExplainCurrentLineCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel
) {
  return async () => {
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
    const selection = await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model to explain line ${lineNumber}`
    });
    if (!selection) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: Explaining line ${lineNumber}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.explainLine(input, selection);
          const markdown = formatLineExplanationMarkdown(result, lineText, lineNumber, enclosingName);
          panel.show(
            `KYC: Line ${lineNumber}${meta.cacheHit ? " (cached)" : ""}`,
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
