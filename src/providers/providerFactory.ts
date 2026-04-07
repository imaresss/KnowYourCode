import { ExtensionConfig, getActiveProviderSettings } from "../core/config";
import { AIProvider, SelectedModel } from "../core/types";
import { ClaudeProvider } from "./claudeProvider";
import { GeminiProvider } from "./geminiProvider";
import { LocalProvider } from "./localProvider";
import { ModelProvider } from "./modelProvider";
import { OpenAIProvider } from "./openaiProvider";
import { ALL_PROVIDERS, PROVIDER_DISPLAY_NAMES } from "./providerMetadata";

export function createProvider(config: ExtensionConfig): ModelProvider {
  const settings = getActiveProviderSettings(config);
  return createProviderForName(settings.provider, settings.endpoint, settings.apiKey, settings.modelName);
}

export function createProviderForSelection(selection: SelectedModel): ModelProvider {
  return createProviderForName(
    selection.provider,
    selection.endpoint,
    selection.apiKey,
    selection.modelName
  );
}

export function createProviderForName(
  name: AIProvider,
  endpoint: string,
  apiKey: string,
  modelName: string
): ModelProvider {
  switch (name) {
    case "openai":
      return new OpenAIProvider(endpoint, apiKey, modelName);
    case "claude":
      return new ClaudeProvider(endpoint, apiKey, modelName);
    case "gemini":
      return new GeminiProvider(endpoint, apiKey, modelName);
    case "local":
      return new LocalProvider(endpoint, modelName);
  }
}

export { ALL_PROVIDERS, PROVIDER_DISPLAY_NAMES };
