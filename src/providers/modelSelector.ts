import * as vscode from "vscode";
import { ExtensionConfig } from "../core/config";
import { ProviderRegistryEntry, SelectedModel } from "../core/types";
import {
  findRegistryEntryBySelectionId,
  getAvailableProviderRegistry,
  getSelectionId,
  resolveSelectedModel
} from "./providerRegistry";

const LAST_SELECTED_MODEL_KEY = "knowYourCode.lastSelectedModel";

interface PickModelOptions {
  title?: string;
  placeHolder?: string;
  forcePrompt?: boolean;
  persistAsDefault?: boolean;
}

export class ModelSelectionService {
  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getConfig: () => ExtensionConfig
  ) {}

  public async pickModel(options: PickModelOptions = {}): Promise<SelectedModel | undefined> {
    let config = this.getConfig();
    let available = getAvailableProviderRegistry(config);

    if (!available.length) {
      const configured = await this.promptToConfigureApiKey();
      if (!configured) {
        return undefined;
      }
      config = this.getConfig();
      available = getAvailableProviderRegistry(config);
      if (!available.length) {
        void vscode.window.showWarningMessage("No AI models are available yet. Check that the provider is enabled and the API key was saved correctly.");
        return undefined;
      }
    }

    if (available.length === 1) {
      const selected = resolveSelectedModel(config, available[0]);
      await this.rememberSelection(selected);
      if (options.persistAsDefault) {
        await this.persistDefaultSelection(selected);
      }
      return selected;
    }

    if (!options.forcePrompt) {
      const defaultSelection = this.getDefaultSelection(config, available);
      if (defaultSelection) {
        await this.rememberSelection(defaultSelection);
        return defaultSelection;
      }
    }

    const picked = await this.showQuickPick(available, config, options);
    if (!picked) {
      return undefined;
    }

    const selected = resolveSelectedModel(config, picked);
    await this.rememberSelection(selected);
    if (options.persistAsDefault) {
      await this.persistDefaultSelection(selected);
    }
    return selected;
  }

  public getLastSelectedModel(): SelectedModel | undefined {
    const config = this.getConfig();
    const selectionId = this.context.globalState.get<string>(LAST_SELECTED_MODEL_KEY);
    if (!selectionId) {
      return undefined;
    }

    const entry = findRegistryEntryBySelectionId(config, selectionId);
    return entry ? resolveSelectedModel(config, entry) : undefined;
  }

  public async rememberSelection(selection: SelectedModel): Promise<void> {
    await this.context.globalState.update(LAST_SELECTED_MODEL_KEY, getSelectionId(selection));
  }

  public async persistDefaultSelection(selection: SelectedModel): Promise<void> {
    const wsConfig = vscode.workspace.getConfiguration("knowYourCode");
    await wsConfig.update("activeProvider", selection.provider, vscode.ConfigurationTarget.Global);
    if (selection.provider === "local") {
      await wsConfig.update("localModelName", selection.modelName, vscode.ConfigurationTarget.Global);
      return;
    }
    await wsConfig.update(`${selection.provider}.modelName`, selection.modelName, vscode.ConfigurationTarget.Global);
  }

  private async showQuickPick(
    available: ProviderRegistryEntry[],
    config: ExtensionConfig,
    options: PickModelOptions
  ): Promise<ProviderRegistryEntry | undefined> {
    const quickPick = vscode.window.createQuickPick<ModelQuickPickItem>();
    quickPick.title = options.title ?? "KYC: Select AI Model";
    quickPick.placeholder = options.placeHolder ?? "Choose which AI provider and model to use";
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    const lastSelected = this.getLastSelectedModel();
    const fallbackId = getSelectionId({
      provider: config.activeProvider,
      modelName: config.activeProvider === "local"
        ? config.localModelName
        : config.providers[config.activeProvider]?.modelName ?? ""
    });

    quickPick.items = buildQuickPickItems(available, fallbackId);

    const preferred = quickPick.items.find((item) => {
      if (!item.entry) {
        return false;
      }
      const selectionId = getSelectionId(item.entry);
      if (lastSelected && selectionId === getSelectionId(lastSelected)) {
        return true;
      }
      return selectionId === fallbackId;
    });
    if (preferred) {
      quickPick.activeItems = [preferred];
    }

    return await new Promise<ProviderRegistryEntry | undefined>((resolve) => {
      let done = false;
      const finish = (value: ProviderRegistryEntry | undefined) => {
        if (done) {
          return;
        }
        done = true;
        quickPick.hide();
        quickPick.dispose();
        resolve(value);
      };

      quickPick.onDidAccept(() => {
        finish(quickPick.selectedItems[0]?.entry);
      });
      quickPick.onDidHide(() => {
        finish(undefined);
      });

      quickPick.show();
    });
  }

  private async promptToConfigureApiKey(): Promise<boolean> {
    const configure = "Set API Key";
    const choice = await vscode.window.showWarningMessage(
      "No remote AI models are available yet. Set an API key first, then choose a model.",
      configure
    );
    if (choice !== configure) {
      return false;
    }

    const result = await vscode.commands.executeCommand<string | undefined>("knowYourCode.setApiKey");
    return Boolean(result);
  }

  private getDefaultSelection(
    config: ExtensionConfig,
    available: ProviderRegistryEntry[]
  ): SelectedModel | undefined {
    const preferredModel = config.activeProvider === "local"
      ? config.localModelName
      : config.providers[config.activeProvider]?.modelName ?? "";

    const byConfig = available.find((entry) =>
      entry.provider === config.activeProvider && entry.modelName === preferredModel
    );
    if (byConfig) {
      return resolveSelectedModel(config, byConfig);
    }

    const lastSelected = this.getLastSelectedModel();
    if (lastSelected) {
      const byLast = available.find((entry) => getSelectionId(entry) === getSelectionId(lastSelected));
      if (byLast) {
        return resolveSelectedModel(config, byLast);
      }
    }

    return available[0] ? resolveSelectedModel(config, available[0]) : undefined;
  }
}

interface ModelQuickPickItem extends vscode.QuickPickItem {
  entry?: ProviderRegistryEntry;
}

function buildQuickPickItems(
  available: ProviderRegistryEntry[],
  defaultSelectionId: string
): ModelQuickPickItem[] {
  const items: ModelQuickPickItem[] = [];
  let previousProvider: string | undefined;

  for (const entry of available) {
    if (previousProvider && previousProvider !== entry.provider) {
      items.push({
        kind: vscode.QuickPickItemKind.Separator,
        label: entry.providerLabel
      });
    }

    const selectionId = getSelectionId(entry);
    items.push({
      label: selectionId === defaultSelectionId ? `(Default) ${entry.modelName}` : entry.modelName,
      description: entry.providerLabel,
      detail: entry.endpoint,
      entry
    });
    previousProvider = entry.provider;
  }

  return items;
}
