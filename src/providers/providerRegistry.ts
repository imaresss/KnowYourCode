import { ExtensionConfig } from "../core/config";
import { AIProvider, ProviderRegistryEntry, SelectedModel } from "../core/types";
import { getProviderModels, PROVIDER_DISPLAY_NAMES } from "./providerMetadata";

export function getProviderRegistry(config: ExtensionConfig): ProviderRegistryEntry[] {
  const remoteProviders = (Object.entries(config.providers) as Array<[string, ExtensionConfig["providers"][string]]>)
    .flatMap(([provider, settings]) => {
      const providerId = provider as AIProvider;
      const models = getProviderModels(providerId, settings.modelName);
      return models.map((modelName) => ({
        provider: providerId,
        providerLabel: PROVIDER_DISPLAY_NAMES[providerId],
        modelName,
        endpoint: settings.endpoint,
        enabled: settings.enabled,
        requiresApiKey: true,
        apiKeyConfigured: Boolean(settings.apiKey.trim()),
        available: settings.enabled && Boolean(settings.apiKey.trim())
      }));
    });

  const localProvider: ProviderRegistryEntry = {
    provider: "local",
    providerLabel: PROVIDER_DISPLAY_NAMES.local,
    modelName: config.localModelName,
    endpoint: config.localEndpoint,
    enabled: config.localEnabled,
    requiresApiKey: false,
    apiKeyConfigured: true,
    available: config.localEnabled && Boolean(config.localEndpoint.trim()) && Boolean(config.localModelName.trim())
  };

  return [...remoteProviders, localProvider];
}

export function getAvailableProviderRegistry(config: ExtensionConfig): ProviderRegistryEntry[] {
  return getProviderRegistry(config).filter((entry) => entry.available);
}

export function getSelectionId(selection: Pick<SelectedModel, "provider" | "modelName">): string {
  return `${selection.provider}::${selection.modelName}`;
}

export function findRegistryEntryBySelectionId(
  config: ExtensionConfig,
  selectionId: string
): ProviderRegistryEntry | undefined {
  return getAvailableProviderRegistry(config).find((entry) => getSelectionId(entry) === selectionId);
}

export function resolveSelectedModel(
  config: ExtensionConfig,
  selection: ProviderRegistryEntry
): SelectedModel {
  return {
    provider: selection.provider,
    providerLabel: selection.providerLabel,
    modelName: selection.modelName,
    endpoint: selection.endpoint,
    apiKey: selection.provider === "local" ? "" : config.providers[selection.provider]?.apiKey ?? ""
  };
}
