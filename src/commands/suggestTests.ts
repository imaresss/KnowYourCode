import * as vscode from "vscode";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";

export function createSuggestTestsCommand() {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to suggest tests for the current function.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No enclosing function or symbol was found at the current cursor.");
      return;
    }

    const { isCursorHandoffEnabled } = await import("../cursor/handoff");
    if (!isCursorHandoffEnabled()) {
      void vscode.window.showInformationMessage(
        "KYC: Suggest Tests requires AI handoff. Enable **Know Your Code: Cursor Handoff** or use Cursor with AI detected."
      );
      return;
    }

    const { handoffToCursorChat } = await import("../cursor/handoff");
    const { buildCursorSuggestTestsPrompt } = await import("../cursor/promptAssembler");
    const prompt = buildCursorSuggestTestsPrompt(context);
    await handoffToCursorChat(prompt, `Suggest Tests — ${context.symbolName}`);
  };
}
