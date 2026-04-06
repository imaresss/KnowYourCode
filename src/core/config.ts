import * as vscode from "vscode";
import { ProviderMode } from "./types";

export interface ExtensionConfig {
  providerMode: ProviderMode;
  modelName: string;
  localEndpoint: string;
  cloudEndpoint: string;
  apiKey: string;
  prefetchConnectedCalls: boolean;
  promptVersion: string;
}

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("knowYourCode");
  return {
    providerMode: config.get<ProviderMode>("providerMode", "local"),
    modelName: config.get<string>("modelName", "qwen2.5-coder:7b"),
    localEndpoint: config.get<string>("localEndpoint", "http://127.0.0.1:11434/api/generate"),
    cloudEndpoint: config.get<string>("cloudEndpoint", ""),
    apiKey: config.get<string>("apiKey", ""),
    prefetchConnectedCalls: config.get<boolean>("prefetchConnectedCalls", true),
    promptVersion: "v1"
  };
}
