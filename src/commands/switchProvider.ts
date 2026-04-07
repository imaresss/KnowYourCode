import * as vscode from "vscode";
import { ModelSelectionService } from "../providers/modelSelector";

export function createSwitchProviderCommand(modelSelector: ModelSelectionService) {
  return async () => {
    const selected = await modelSelector.pickModel({
      title: "KYC: Switch AI Model",
      placeHolder: "Choose the provider and model to prefer next"
    });
    if (!selected) {
      return;
    }

    const wsConfig = vscode.workspace.getConfiguration("knowYourCode");
    await wsConfig.update("activeProvider", selected.provider, vscode.ConfigurationTarget.Global);

    void vscode.window.showInformationMessage(
      `KYC will default to ${selected.providerLabel} (${selected.modelName}) when that option is available.`
    );
  };
}
