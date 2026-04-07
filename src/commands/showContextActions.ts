import * as vscode from "vscode";
import { getAvailableActions } from "../context/actionRegistry";
import { resolveInteractionContext } from "../context/interactionContext";

export function createShowContextActionsCommand() {
  return async () => {
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

    const actions = getAvailableActions(context);
    const picked = await vscode.window.showQuickPick(
      actions.map((action) => ({
        label: action.title,
        description: context.displayName,
        detail: action.description,
        action
      })),
      {
        placeHolder: `KYC actions for ${context.displayName}`,
        title: "Know Your Code"
      }
    );

    if (!picked) {
      return;
    }

    await vscode.commands.executeCommand(picked.action.command, ...(picked.action.args ?? []));
  };
}
