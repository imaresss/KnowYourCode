export type ProviderMode = "local" | "cloud";

export type SymbolKind = "function" | "method" | "class" | "unknown";

export interface RelatedSymbol {
  name: string;
  filePath: string;
  signature?: string;
  snippet?: string;
}

export interface ExplainFunctionInput {
  workspaceRoot: string;
  filePath: string;
  language: string;
  symbolName: string;
  symbolKind: SymbolKind;
  signature?: string;
  containerName?: string;
  symbolKeyHint?: string;
  range: { startLine: number; endLine: number };
  code: string;
  imports: string[];
  callers: RelatedSymbol[];
  callees: RelatedSymbol[];
  nearbySymbols: RelatedSymbol[];
  contentHash: string;
  dependencyHash: string;
}

export interface ExplainFunctionResult {
  summary: string;
  purpose: string;
  stepByStep: string[];
  inputs: string[];
  outputs: string[];
  dependencies: string[];
  risks: string[];
  connectedFlow: string[];
  confidence: number;
}

export interface SymbolContext {
  workspaceRoot: string;
  filePath: string;
  language: string;
  symbolName: string;
  symbolKind: SymbolKind;
  signature?: string;
  containerName?: string;
  symbolKeyHint?: string;
  range: { startLine: number; endLine: number };
  code: string;
  imports: string[];
  callers: RelatedSymbol[];
  callees: RelatedSymbol[];
  nearbySymbols: RelatedSymbol[];
}

export interface StoredExplanation {
  symbolKey: string;
  explanationType: "function";
  contentHash: string;
  dependencyHash: string;
  modelName: string;
  providerMode: ProviderMode;
  promptVersion: string;
  result: ExplainFunctionResult;
  createdAt: string;
}

export interface ExplainFunctionOptions {
  forceRefresh?: boolean;
}

export interface ConnectedCallsSnapshot {
  symbolName: string;
  filePath: string;
  callers: RelatedSymbol[];
  callees: RelatedSymbol[];
  cachedCallees: RelatedSymbol[];
}
