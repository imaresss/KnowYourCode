import * as vscode from "vscode";
import { ModelSelectionService } from "../providers/modelSelector";

export function createSwitchProviderCommand(modelSelector: ModelSelectionService) {
  return async () => {
    const selected = await modelSelector.pickModel({
      title: "KYC: Switch AI Model",
      placeHolder: "Choose the provider and model to set as default",
      forcePrompt: true,
      persistAsDefault: true
    });
    if (!selected) {
      return;
    }

    void vscode.window.showInformationMessage(
      `Default model changed to ${selected.providerLabel} (${selected.modelName}).`
    );
  };
}
