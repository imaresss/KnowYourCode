export type AIProvider = "openai" | "claude" | "gemini" | "local";

export type SymbolKind = "function" | "method" | "class" | "unknown";

export type ExplanationAction = "explainFunction" | "explainLine" | "explainCallFlow" | "contextAction";

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

export interface ExplainLineInput {
  filePath: string;
  language: string;
  lineText: string;
  lineNumber: number;
  enclosingSymbolName: string;
  enclosingCode: string;
  imports: string[];
  contentHash: string;
}

export interface ExplainCallFlowInput {
  workspaceRoot: string;
  filePath: string;
  language: string;
  symbolName: string;
  symbolKind: SymbolKind;
  code: string;
  callers: RelatedSymbol[];
  callees: RelatedSymbol[];
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

export interface ExplainLineResult {
  lineExplanation: string;
  whyItMatters: string;
  technicalDetail: string;
  relatedConcepts: string[];
}

export interface ExplainCallFlowResult {
  overview: string;
  flowSteps: string[];
  dataFlow: string[];
  entryPoints: string[];
  exitPoints: string[];
  sideEffects: string[];
  edgeCases: string[];
}

export interface GenericMarkdownResult {
  markdown: string;
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
  explanationType: ExplanationAction;
  contentHash: string;
  dependencyHash: string;
  modelName: string;
  provider: AIProvider;
  promptVersion: string;
  result: ExplainFunctionResult | ExplainLineResult | ExplainCallFlowResult | GenericMarkdownResult;
  createdAt: string;
}

export interface ExplanationLookup {
  symbolKey: string;
  contentHash: string;
  dependencyHash: string;
  modelName: string;
  provider: AIProvider;
  promptVersion: string;
}

export interface ExplanationPresentation {
  cacheHit: boolean;
  cacheLabel: string;
  modelName: string;
  provider: AIProvider;
  providerLabel: string;
  createdAt?: string;
}

export interface ExplanationResponse<T> {
  result: T;
  meta: ExplanationPresentation;
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

export interface ProviderSettings {
  enabled: boolean;
  apiKey: string;
  endpoint: string;
  modelName: string;
}

export interface ProviderRegistryEntry {
  provider: AIProvider;
  providerLabel: string;
  modelName: string;
  endpoint: string;
  enabled: boolean;
  requiresApiKey: boolean;
  apiKeyConfigured: boolean;
  available: boolean;
}

export interface SelectedModel {
  provider: AIProvider;
  providerLabel: string;
  modelName: string;
  endpoint: string;
  apiKey: string;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}
