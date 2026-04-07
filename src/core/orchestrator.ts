import { ExplanationRepository } from "../cache/explanationRepo";
import { ExtensionConfig } from "./config";
import {
  ConnectedCallsSnapshot,
  ExplainCallFlowInput,
  ExplainCallFlowResult,
  ExplainFunctionInput,
  ExplainFunctionOptions,
  ExplainFunctionResult,
  ExplainLineInput,
  ExplainLineResult,
  ExplanationLookup,
  ExplanationPresentation,
  ExplanationResponse,
  GenericMarkdownResult,
  SelectedModel,
  StoredExplanation,
  StreamCallbacks,
  SymbolContext
} from "./types";
import { buildSymbolKey } from "../intelligence/fingerprint";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { resolveConnectedSymbolContexts } from "../intelligence/symbolResolver";
import { buildExplainCallFlowPrompt, buildExplainLinePrompt } from "../providers/promptBuilder";
import { createProviderForSelection, PROVIDER_DISPLAY_NAMES } from "../providers/providerFactory";
import { parseJsonObjectFromModelText } from "../providers/normalizeExplanation";

export class ExplanationOrchestrator {
  private config: ExtensionConfig;
  private readonly inFlightRequests = new Map<string, Promise<unknown>>();

  public constructor(
    private readonly repo: ExplanationRepository,
    config: ExtensionConfig
  ) {
    this.config = config;
  }

  public updateConfig(config: ExtensionConfig): void {
    this.config = config;
  }

  public async explainFunction(
    input: ExplainFunctionInput,
    selection: SelectedModel,
    options: ExplainFunctionOptions = {}
  ): Promise<ExplanationResponse<ExplainFunctionResult>> {
    const symbolKey = buildSymbolKey(input);
    const lookup: ExplanationLookup = {
      symbolKey,
      contentHash: input.contentHash,
      dependencyHash: input.dependencyHash,
      modelName: selection.modelName,
      provider: selection.provider,
      promptVersion: this.config.promptVersion
    };

    const existing = options.forceRefresh
      ? undefined
      : this.repo.findValid(lookup, this.getCacheTtlMs());

    if (existing) {
      return {
        result: existing.result as ExplainFunctionResult,
        meta: this.buildPresentation(true, existing)
      };
    }

    return this.withInFlightDedup(lookup, async () => {
      const provider = createProviderForSelection(selection);
      const result = await provider.explainFunction(input);
      this.repo.replaceCallEdges(symbolKey, input.callees);

      const record: StoredExplanation = {
        ...lookup,
        explanationType: "explainFunction",
        result,
        createdAt: new Date().toISOString()
      };
      this.repo.save(record);
      return {
        result,
        meta: this.buildPresentation(false, record)
      };
    });
  }

  public async explainLine(
    input: ExplainLineInput,
    selection: SelectedModel
  ): Promise<ExplanationResponse<ExplainLineResult>> {
    const symbolKey = `line::${input.filePath}::${input.lineNumber}`;
    const lookup: ExplanationLookup = {
      symbolKey,
      contentHash: input.contentHash,
      dependencyHash: "",
      modelName: selection.modelName,
      provider: selection.provider,
      promptVersion: this.config.promptVersion
    };

    const existing = this.repo.findValid(lookup, this.getCacheTtlMs());

    if (existing) {
      return {
        result: existing.result as ExplainLineResult,
        meta: this.buildPresentation(true, existing)
      };
    }

    return this.withInFlightDedup(lookup, async () => {
      const prompt = buildExplainLinePrompt(input);
      const raw = await this.callProviderRaw(selection, prompt);
      const result = parseLineResult(raw);

      const record: StoredExplanation = {
        ...lookup,
        explanationType: "explainLine",
        result,
        createdAt: new Date().toISOString()
      };
      this.repo.save(record);
      return {
        result,
        meta: this.buildPresentation(false, record)
      };
    });
  }

  public async explainCallFlow(
    input: ExplainCallFlowInput,
    selection: SelectedModel
  ): Promise<ExplanationResponse<ExplainCallFlowResult>> {
    const symbolKey = `callflow::${input.filePath}::${input.symbolName}`;
    const lookup: ExplanationLookup = {
      symbolKey,
      contentHash: input.contentHash,
      dependencyHash: input.dependencyHash,
      modelName: selection.modelName,
      provider: selection.provider,
      promptVersion: this.config.promptVersion
    };

    const existing = this.repo.findValid(lookup, this.getCacheTtlMs());

    if (existing) {
      return {
        result: existing.result as ExplainCallFlowResult,
        meta: this.buildPresentation(true, existing)
      };
    }

    return this.withInFlightDedup(lookup, async () => {
      const prompt = buildExplainCallFlowPrompt(input);
      const raw = await this.callProviderRaw(selection, prompt);
      const result = parseCallFlowResult(raw);

      const record: StoredExplanation = {
        ...lookup,
        explanationType: "explainCallFlow",
        result,
        createdAt: new Date().toISOString()
      };
      this.repo.save(record);
      return {
        result,
        meta: this.buildPresentation(false, record)
      };
    });
  }

  public async runContextAction(input: {
    actionId: string;
    key: string;
    contentHash: string;
    dependencyHash?: string;
    prompt: string;
    selection: SelectedModel;
  }): Promise<ExplanationResponse<GenericMarkdownResult>> {
    const lookup: ExplanationLookup = {
      symbolKey: `contextAction::${input.actionId}::${input.key}`,
      contentHash: input.contentHash,
      dependencyHash: input.dependencyHash ?? "",
      modelName: input.selection.modelName,
      provider: input.selection.provider,
      promptVersion: this.config.promptVersion
    };

    const existing = this.repo.findValid(lookup, this.getCacheTtlMs());
    if (existing) {
      return {
        result: existing.result as GenericMarkdownResult,
        meta: this.buildPresentation(true, existing)
      };
    }

    return this.withInFlightDedup(lookup, async () => {
      const raw = await this.callProviderRaw(input.selection, input.prompt);
      const record: StoredExplanation = {
        ...lookup,
        explanationType: "contextAction",
        result: {
          markdown: raw.trim()
        },
        createdAt: new Date().toISOString()
      };
      this.repo.save(record);
      return {
        result: record.result as GenericMarkdownResult,
        meta: this.buildPresentation(false, record)
      };
    });
  }

  public async streamExplain(
    selection: SelectedModel,
    prompt: string,
    callbacks: StreamCallbacks
  ): Promise<string | undefined> {
    const provider = createProviderForSelection(selection);
    if (provider.streamRaw) {
      return provider.streamRaw(prompt, callbacks);
    }
    return undefined;
  }

  public invalidateSymbol(symbolKey: string): void {
    this.repo.invalidateSymbol(symbolKey);
  }

  public invalidateFile(filePath: string): void {
    this.repo.invalidateFile(filePath);
  }

  public async prefetchConnectedContexts(context: SymbolContext, selection: SelectedModel): Promise<void> {
    if (!this.config.prefetchConnectedCalls) {
      return;
    }

    const connectedContexts = await resolveConnectedSymbolContexts(context);
    for (const related of connectedContexts.slice(0, 4)) {
      const input = buildExplainFunctionInput(related);
      try {
        await this.explainFunction(input, selection);
      } catch {
        // background prefetch should never interrupt the user
      }
    }
  }

  public getConnectedCalls(context: SymbolContext): ConnectedCallsSnapshot {
    const symbolKey = buildSymbolKey(context);
    return {
      symbolName: context.symbolName,
      filePath: context.filePath,
      callers: context.callers,
      callees: context.callees,
      cachedCallees: this.repo.getCallEdges(symbolKey)
    };
  }

  private async callProviderRaw(selection: SelectedModel, prompt: string): Promise<string> {
    const provider = createProviderForSelection(selection);
    if (provider.streamRaw) {
      let accumulated = "";
      await provider.streamRaw(prompt, {
        onChunk: (chunk) => { accumulated += chunk; },
        onDone: () => {},
        onError: () => {}
      });
      return accumulated;
    }

    const dummyInput = {
      workspaceRoot: "", filePath: "", language: "", symbolName: "",
      symbolKind: "function" as const, code: prompt, imports: [],
      callers: [], callees: [], nearbySymbols: [],
      contentHash: "", dependencyHash: "",
      range: { startLine: 0, endLine: 0 }
    };
    const result = await provider.explainFunction(dummyInput);
    return JSON.stringify(result);
  }

  private getCacheTtlMs(): number {
    return this.config.cacheTtlSeconds > 0 ? this.config.cacheTtlSeconds * 1000 : 0;
  }

  private buildPresentation(cacheHit: boolean, record: StoredExplanation): ExplanationPresentation {
    return {
      cacheHit,
      cacheLabel: `${cacheHit ? "Cached" : "Generated"} (${record.modelName})`,
      modelName: record.modelName,
      provider: record.provider,
      providerLabel: PROVIDER_DISPLAY_NAMES[record.provider],
      createdAt: record.createdAt
    };
  }

  private async withInFlightDedup<T>(
    lookup: ExplanationLookup,
    loader: () => Promise<ExplanationResponse<T>>
  ): Promise<ExplanationResponse<T>> {
    const key = [
      lookup.symbolKey,
      lookup.contentHash,
      lookup.dependencyHash,
      lookup.modelName,
      lookup.provider,
      lookup.promptVersion
    ].join("::");

    const existing = this.inFlightRequests.get(key) as Promise<ExplanationResponse<T>> | undefined;
    if (existing) {
      return existing;
    }

    const request = this.runDebounced(loader);
    this.inFlightRequests.set(key, request);
    try {
      return await request;
    } finally {
      this.inFlightRequests.delete(key);
    }
  }

  private async runDebounced<T>(loader: () => Promise<T>): Promise<T> {
    if (this.config.selectionDebounceMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.config.selectionDebounceMs);
      });
    }
    return loader();
  }
}

function parseLineResult(raw: string): ExplainLineResult {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = parseJsonObjectFromModelText<Record<string, unknown>>(cleaned);
  if (parsed) {
    return {
      lineExplanation: String(parsed.lineExplanation ?? parsed.explanation ?? ""),
      whyItMatters: String(parsed.whyItMatters ?? parsed.importance ?? ""),
      technicalDetail: String(parsed.technicalDetail ?? parsed.technical ?? ""),
      relatedConcepts: Array.isArray(parsed.relatedConcepts) ? parsed.relatedConcepts.map(String) : []
    };
  }

  return {
    lineExplanation: cleaned.split("\n")[0] || "Unable to parse line explanation.",
    whyItMatters: "",
    technicalDetail: cleaned,
    relatedConcepts: []
  };
}

function parseCallFlowResult(raw: string): ExplainCallFlowResult {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = parseJsonObjectFromModelText<Record<string, unknown>>(cleaned);
  if (parsed) {
    return {
      overview: String(parsed.overview ?? ""),
      flowSteps: ensureStringArray(parsed.flowSteps),
      dataFlow: ensureStringArray(parsed.dataFlow),
      entryPoints: ensureStringArray(parsed.entryPoints),
      exitPoints: ensureStringArray(parsed.exitPoints),
      sideEffects: ensureStringArray(parsed.sideEffects),
      edgeCases: ensureStringArray(parsed.edgeCases)
    };
  }

  return {
    overview: cleaned.split("\n")[0] || "Unable to parse call flow explanation.",
    flowSteps: [],
    dataFlow: [],
    entryPoints: [],
    exitPoints: [],
    sideEffects: [],
    edgeCases: []
  };
}

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object") {
        return JSON.stringify(item);
      }
      return String(item);
    });
  }
  if (typeof value === "string" && value.trim()) { return [value.trim()]; }
  return [];
}
