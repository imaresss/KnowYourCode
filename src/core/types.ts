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
  lineEndNumber?: number;
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
  sourceCode?: string;
  incrementalDepth?: number;
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
  incremental?: boolean;
  incrementalDepth?: number;
  changedLines?: number;
  tokenUsage?: TokenUsage;
  derived?: boolean;
  derivedFromFunction?: string;
}

export interface ExplanationResponse<T> {
  result: T;
  meta: ExplanationPresentation;
}

export interface ExplainFunctionOptions {
  forceRefresh?: boolean;
}

export interface ExplainLineOptions {
  forceRefresh?: boolean;
}

export interface ExplainCallFlowOptions {
  forceRefresh?: boolean;
}

export interface RunContextActionOptions {
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

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export interface ChangedRegion {
  oldStartLine: number;
  newStartLine: number;
  linesRemoved: number;
  linesAdded: number;
}

export interface DiffAnalysis {
  totalLines: number;
  changedLines: number;
  addedLines: number;
  removedLines: number;
  changeRatio: number;
  regionCount: number;
  regions: ChangedRegion[];
  unifiedDiff: string;
}

export interface IncrementalConfig {
  enabled: boolean;
  minFunctionLines: number;
  maxChangeRatio: number;
  maxChangedLines: number;
  maxChangedRegions: number;
  contextLines: number;
  maxIncrementalDepth: number;
}
