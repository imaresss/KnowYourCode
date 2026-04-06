import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { getConfig } from "../core/config";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { ExplanationPanel } from "../ui/panel";

export function createExplainCurrentLineCommand(
  orchestrator: ExplanationOrchestrator,
  panel: ExplanationPanel
) {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const lineText = editor.document.lineAt(editor.selection.active.line).text.trim();
    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      return;
    }

    const input = buildExplainFunctionInput(context);
    let result;
    try {
      ({ result } = await orchestrator.explainFunction(input));
    } catch (error) {
      const friendly = formatProviderError(error, getConfig().providerMode);
      result = buildFallbackExplanation(context, friendly);
      void vscode.window.showWarningMessage(friendly);
    }
    const content = [
      `# Line Explanation`,
      "",
      `Current line: \`${lineText}\``,
      "",
      `Function: ${context.symbolName}`,
      "",
      result.summary,
      "",
      "Most likely role of this line:",
      result.stepByStep[0] ?? "The line participates in the current function flow."
    ].join("\n");

    panel.show(`Know Your Code: Line in ${context.symbolName}`, content);
  };
}
