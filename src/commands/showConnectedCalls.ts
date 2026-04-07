import * as vscode from "vscode";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationPanel } from "../ui/panel";
import { formatConnectedCallsMarkdown } from "../ui/formatter";

export function createShowConnectedCallsCommand(
  orchestrator: ExplanationOrchestrator,
  panel: ExplanationPanel
) {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to inspect connected calls.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No enclosing function or symbol was found at the current cursor.");
      return;
    }

    const snapshot = orchestrator.getConnectedCalls(context);
    panel.show(
      `KYC: Calls for ${context.symbolName}`,
      formatConnectedCallsMarkdown(snapshot),
      { provider: "Workspace", cacheHit: false }
    );
  };
}
