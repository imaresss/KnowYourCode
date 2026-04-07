import * as vscode from "vscode";
import { AIProvider } from "../core/types";
import { PROVIDER_DISPLAY_NAMES } from "../providers/providerMetadata";

export function createSetApiKeyCommand() {
  return async (preferredProvider?: AIProvider): Promise<AIProvider | undefined> => {
    const providers: AIProvider[] = ["openai", "claude", "gemini"];
    const items = providers.map((p) => ({ label: PROVIDER_DISPLAY_NAMES[p], id: p }));
    const selected = preferredProvider
      ? items.find((item) => item.id === preferredProvider)
      : await vscode.window.showQuickPick(
        items,
        {
          placeHolder: "Select AI provider to configure",
          title: "KYC: Set API Key"
        }
      );

    if (!selected) {
      return undefined;
    }

    const apiKey = await vscode.window.showInputBox({
      prompt: `Enter API key for ${selected.label}`,
      password: true,
      placeHolder: "sk-... or your API key",
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.trim()) { return "API key cannot be empty"; }
        return undefined;
      }
    });

    if (!apiKey) {
      return undefined;
    }

    const config = vscode.workspace.getConfiguration("knowYourCode");
    await config.update(`${selected.id}.apiKey`, apiKey.trim(), vscode.ConfigurationTarget.Global);

    void vscode.window.showInformationMessage(
      `API key for ${selected.label} has been saved. ${getKeyHint(selected.id)}`
    );
    return selected.id;
  };
}

function getKeyHint(provider: string): string {
  switch (provider) {
    case "openai":
      return "Get keys at platform.openai.com";
    case "claude":
      return "Get keys at console.anthropic.com";
    case "gemini":
      return "Get keys at aistudio.google.com";
    default:
      return "";
  }
}
