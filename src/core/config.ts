import * as vscode from "vscode";
import { AIProvider, IncrementalConfig, ProviderSettings } from "./types";

export interface ExtensionConfig {
  activeProvider: AIProvider;
  providers: Record<string, ProviderSettings>;
  localEnabled: boolean;
  localEndpoint: string;
  localModelName: string;
  prefetchConnectedCalls: boolean;
  cacheTtlSeconds: number;
  inlineActionsEnabled: boolean;
  selectionDebounceMs: number;
  promptVersion: string;
  incremental: IncrementalConfig;
  cursorHandoff: boolean;
}

const DEFAULT_PROVIDERS: Record<string, { endpoint: string; modelName: string }> = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    modelName: "gpt-4o-mini"
  },
  claude: {
    endpoint: "https://api.anthropic.com/v1/messages",
    modelName: "claude-haiku-4-5-20251001"
  },
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    modelName: "gemini-2.0-flash"
  }
};

export function getConfig(): ExtensionConfig {
  const ws = vscode.workspace.getConfiguration("knowYourCode");
  const providers: Record<string, ProviderSettings> = {};

  for (const [name, defaults] of Object.entries(DEFAULT_PROVIDERS)) {
    providers[name] = {
      enabled: ws.get<boolean>(`${name}.enabled`, true),
      apiKey: ws.get<string>(`${name}.apiKey`, ""),
      endpoint: ws.get<string>(`${name}.endpoint`, defaults.endpoint),
      modelName: ws.get<string>(`${name}.modelName`, defaults.modelName)
    };
  }

  return {
    activeProvider: ws.get<AIProvider>("activeProvider", "openai"),
    providers,
    localEnabled: ws.get<boolean>("localEnabled", true),
    localEndpoint: ws.get<string>("localEndpoint", "http://127.0.0.1:11434/api/generate"),
    localModelName: ws.get<string>("localModelName", "qwen2.5-coder:7b"),
    prefetchConnectedCalls: ws.get<boolean>("prefetchConnectedCalls", true),
    cacheTtlSeconds: Math.max(0, ws.get<number>("cacheTtlSeconds", 0)),
    inlineActionsEnabled: ws.get<boolean>("inlineActionsEnabled", true),
    selectionDebounceMs: Math.max(0, ws.get<number>("selectionDebounceMs", 250)),
    promptVersion: "v2",
    cursorHandoff: ws.get<boolean>("cursorHandoff", true),
    incremental: {
      enabled: ws.get<boolean>("incremental.enabled", true),
      minFunctionLines: Math.max(1, ws.get<number>("incremental.minFunctionLines", 20)),
      maxChangeRatio: Math.min(1, Math.max(0, ws.get<number>("incremental.maxChangeRatio", 0.3))),
      maxChangedLines: Math.max(1, ws.get<number>("incremental.maxChangedLines", 25)),
      maxChangedRegions: Math.max(1, ws.get<number>("incremental.maxChangedRegions", 4)),
      contextLines: Math.max(1, ws.get<number>("incremental.contextLines", 5)),
      maxIncrementalDepth: Math.max(1, ws.get<number>("incremental.maxIncrementalDepth", 5))
    }
  };
}

export function getActiveProviderSettings(config: ExtensionConfig): ProviderSettings & { provider: AIProvider } {
  if (config.activeProvider === "local") {
    return {
      enabled: config.localEnabled,
      provider: "local",
      apiKey: "",
      endpoint: config.localEndpoint,
      modelName: config.localModelName
    };
  }

  const settings = config.providers[config.activeProvider];
  if (!settings) {
    throw new Error(`Unknown provider: ${config.activeProvider}`);
  }

  return { provider: config.activeProvider, ...settings };
}

export function getModelName(config: ExtensionConfig): string {
  if (config.activeProvider === "local") {
    return config.localModelName;
  }
  return config.providers[config.activeProvider]?.modelName ?? "unknown";
}
