import * as vscode from "vscode";
import { ExtensionConfig } from "../core/config";
import { getAvailableActions } from "../context/actionRegistry";
import { resolveInteractionContext } from "../context/interactionContext";

export class ContextActionCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  public readonly onDidChangeCodeLenses = this.emitter.event;

  public constructor(private readonly getConfig: () => ExtensionConfig) {}

  public provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
      return [];
    }

    if (!this.getConfig().inlineActionsEnabled) {
      return [];
    }

    return resolveInteractionContext(editor).then((context) => {
      if (!context) {
        return [];
      }

      const actions = getAvailableActions(context);
      if (!actions.length) {
        return [];
      }

      const range = new vscode.Range(context.anchorLine, 0, context.anchorLine, 0);
      return actions.map((action) =>
        new vscode.CodeLens(range, {
          title: action.title,
          command: action.command,
          arguments: action.args
        })
      );
    });
  }

  public scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.emitter.fire();
    }, this.getConfig().selectionDebounceMs);
  }
}
