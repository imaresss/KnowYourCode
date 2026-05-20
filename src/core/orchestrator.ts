import { ExplanationRepository } from "../cache/explanationRepo";
import { ExtensionConfig } from "./config";
import {
  ConnectedCallsSnapshot,
  CreateTutorialOptions,
  ExplainCallFlowInput,
  ExplainCallFlowOptions,
  ExplainCallFlowResult,
  ExplainFunctionInput,
  ExplainFunctionOptions,
  ExplainFunctionResult,
  ExplainLineInput,
  ExplainLineOptions,
  ExplainLineResult,
  ExplanationLookup,
  ExplanationPresentation,
  ExplanationResponse,
  GenericMarkdownResult,
  RunContextActionOptions,
  SelectedModel,
  StoredExplanation,
  StreamCallbacks,
  SymbolContext,
  TokenUsage,
  TutorialMode,
  TutorialScript
} from "./types";
import { buildSymbolKey } from "../intelligence/fingerprint";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { analyzeDiff, isIncrementalCandidate } from "../intelligence/diffAnalysis";
import { resolveConnectedSymbolContexts } from "../intelligence/symbolResolver";
import {
  buildCreateTutorialPrompt,
  buildExplainCallFlowPrompt,
  buildExplainLinePrompt,
  buildIncrementalExplainPrompt
} from "../providers/promptBuilder";
import { createProviderForSelection, PROVIDER_DISPLAY_NAMES } from "../providers/providerFactory";
import { logInfo } from "../utils/logger";
import { parseKYCResponse } from "./responseParser";
import { parseTutorialScript } from "./tutorialParser";

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

    const incrementalConfig = this.config.incremental;
    if (incrementalConfig.enabled && !options.forceRefresh) {
      const previous = this.repo.findLatestForSymbol(input.filePath, input.symbolName);
      if (
        previous &&
        previous.sourceCode &&
        previous.sourceCode !== input.code &&
        (previous.incrementalDepth ?? 0) < incrementalConfig.maxIncrementalDepth
      ) {
        const prevCode = previous.sourceCode;
        const lineCount = input.code.split("\n").length;
        if (lineCount >= incrementalConfig.minFunctionLines) {
          const diff = analyzeDiff(prevCode, input.code, incrementalConfig.contextLines);
          if (isIncrementalCandidate(diff, incrementalConfig)) {
            logInfo(`Incremental explain for ${input.symbolName}: ${diff.changedLines} lines changed, ${diff.regionCount} region(s), depth ${(previous.incrementalDepth ?? 0) + 1}`);
            const prev = previous;
            return this.withInFlightDedup(
              lookup,
              () => this.runIncrementalExplain(input, selection, prev, diff, lookup, options.signal),
              options.signal
            );
          } else {
            logInfo(`Incremental skipped for ${input.symbolName}: diff too large (${diff.changedLines} lines, ${diff.regionCount} regions, ratio ${diff.changeRatio.toFixed(2)})`);
          }
        }
      }
    }

    return this.withInFlightDedup(lookup, async () => {
      const provider = createProviderForSelection(selection);
      const result = await provider.explainFunction(input, { signal: options.signal });
      this.repo.replaceCallEdges(symbolKey, input.callees);

      const record: StoredExplanation = {
        ...lookup,
        explanationType: "explainFunction",
        result,
        sourceCode: input.code,
        incrementalDepth: 0,
        createdAt: new Date().toISOString()
      };
      this.repo.save(record);
      return {
        result,
        meta: { ...this.buildPresentation(false, record), tokenUsage: provider.tokenUsage }
      };
    }, options.signal);
  }

  private async runIncrementalExplain(
    input: ExplainFunctionInput,
    selection: SelectedModel,
    previous: StoredExplanation,
    diff: import("./types").DiffAnalysis,
    lookup: ExplanationLookup,
    signal?: AbortSignal
  ): Promise<ExplanationResponse<ExplainFunctionResult>> {
    const previousResult = previous.result as ExplainFunctionResult;
    const prompt = buildIncrementalExplainPrompt(input, previousResult, diff);
    const { text: raw, tokenUsage } = await this.callProviderRaw(selection, prompt, signal);
    const result = parseIncrementalResult(raw, previousResult, selection.modelName);
    const newDepth = (previous.incrementalDepth ?? 0) + 1;

    this.repo.replaceCallEdges(lookup.symbolKey, input.callees);

    const record: StoredExplanation = {
      ...lookup,
      explanationType: "explainFunction",
      result,
      sourceCode: input.code,
      incrementalDepth: newDepth,
      createdAt: new Date().toISOString()
    };
    this.repo.save(record);

    return {
      result,
      meta: {
        ...this.buildPresentation(false, record),
        incremental: true,
        incrementalDepth: newDepth,
        changedLines: diff.changedLines,
        tokenUsage
      }
    };
  }

  public async explainLine(
    input: ExplainLineInput,
    selection: SelectedModel,
    options: ExplainLineOptions = {}
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

    const existing = options.forceRefresh
      ? undefined
      : this.repo.findValid(lookup, this.getCacheTtlMs());

    if (existing) {
      return {
        result: existing.result as ExplainLineResult,
        meta: this.buildPresentation(true, existing)
      };
    }

    return this.withInFlightDedup(lookup, async () => {
      const prompt = buildExplainLinePrompt(input);
      const { text: raw, tokenUsage } = await this.callProviderRaw(selection, prompt, options.signal);
      const result = parseLineResult(raw, selection.modelName);

      const record: StoredExplanation = {
        ...lookup,
        explanationType: "explainLine",
        result,
        createdAt: new Date().toISOString()
      };
      this.repo.save(record);
      return {
        result,
        meta: { ...this.buildPresentation(false, record), tokenUsage }
      };
    }, options.signal);
  }

  public async explainCallFlow(
    input: ExplainCallFlowInput,
    selection: SelectedModel,
    options: ExplainCallFlowOptions = {}
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

    const existing = options.forceRefresh
      ? undefined
      : this.repo.findValid(lookup, this.getCacheTtlMs());

    if (existing) {
      return {
        result: existing.result as ExplainCallFlowResult,
        meta: this.buildPresentation(true, existing)
      };
    }

    return this.withInFlightDedup(lookup, async () => {
      const prompt = buildExplainCallFlowPrompt(input);
      const { text: raw, tokenUsage } = await this.callProviderRaw(selection, prompt, options.signal);
      const result = parseCallFlowResult(raw, selection.modelName);

      const record: StoredExplanation = {
        ...lookup,
        explanationType: "explainCallFlow",
        result,
        createdAt: new Date().toISOString()
      };
      this.repo.save(record);
      return {
        result,
        meta: { ...this.buildPresentation(false, record), tokenUsage }
      };
    }, options.signal);
  }

  public async createTutorial(
    mode: TutorialMode,
    input: ExplainFunctionInput | ExplainCallFlowInput,
    lineRange: { startLine: number; endLine: number },
    selection: SelectedModel,
    options: CreateTutorialOptions = {}
  ): Promise<ExplanationResponse<TutorialScript>> {
    const symbolKey =
      mode === "function"
        ? `tutorial::fn::${buildSymbolKey(input as SymbolContext)}`
        : `tutorial::cf::${(input as ExplainCallFlowInput).workspaceRoot}::${(input as ExplainCallFlowInput).filePath}::${(input as ExplainCallFlowInput).symbolName}`;

    const contentHash =
      mode === "function"
        ? (input as ExplainFunctionInput).contentHash
        : (input as ExplainCallFlowInput).contentHash;
    const dependencyHash =
      mode === "function"
        ? (input as ExplainFunctionInput).dependencyHash
        : (input as ExplainCallFlowInput).dependencyHash;

    const lookup: ExplanationLookup = {
      symbolKey,
      contentHash,
      dependencyHash,
      modelName: selection.modelName,
      provider: selection.provider,
      promptVersion: this.config.promptVersion
    };

    const existing = options.forceRefresh ? undefined : this.repo.findValid(lookup, this.getCacheTtlMs());

    if (existing && existing.explanationType === "createTutorial") {
      return {
        result: existing.result as TutorialScript,
        meta: this.buildPresentation(true, existing)
      };
    }

    return this.withInFlightDedup(
      lookup,
      async () => {
        const prompt = buildCreateTutorialPrompt(mode, input);
        const { text: raw, tokenUsage } = await this.callProviderRaw(selection, prompt, options.signal);
        const script = parseTutorialScript(raw, {
          modelName: selection.modelName,
          lineRange
        });

        const record: StoredExplanation = {
          ...lookup,
          explanationType: "createTutorial",
          result: script,
          createdAt: new Date().toISOString(),
          sourceCode: input.code
        };
        this.repo.save(record);
        return {
          result: script,
          meta: { ...this.buildPresentation(false, record), tokenUsage }
        };
      },
      options.signal
    );
  }

  public async runContextAction(input: {
    actionId: string;
    key: string;
    contentHash: string;
    dependencyHash?: string;
    prompt: string;
    selection: SelectedModel;
  }, options: RunContextActionOptions = {}): Promise<ExplanationResponse<GenericMarkdownResult>> {
    const lookup: ExplanationLookup = {
      symbolKey: `contextAction::${input.actionId}::${input.key}`,
      contentHash: input.contentHash,
      dependencyHash: input.dependencyHash ?? "",
      modelName: input.selection.modelName,
      provider: input.selection.provider,
      promptVersion: this.config.promptVersion
    };

    const existing = options.forceRefresh
      ? undefined
      : this.repo.findValid(lookup, this.getCacheTtlMs());
    if (existing) {
      return {
        result: existing.result as GenericMarkdownResult,
        meta: this.buildPresentation(true, existing)
      };
    }

    return this.withInFlightDedup(lookup, async () => {
      const { text: raw, tokenUsage } = await this.callProviderRaw(input.selection, input.prompt, options.signal);
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
        meta: { ...this.buildPresentation(false, record), tokenUsage }
      };
    }, options.signal);
  }

  public async streamExplain(
    selection: SelectedModel,
    prompt: string,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    const provider = createProviderForSelection(selection);
    if (provider.streamRaw) {
      return provider.streamRaw(prompt, callbacks, { signal });
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

  public findCachedFunctionExplanation(
    symbolKey: string,
    contentHash: string
  ): { result: ExplainFunctionResult; stored: StoredExplanation } | undefined {
    const stored = this.repo.findLatestBySymbolKey(symbolKey);
    if (!stored) {
      return undefined;
    }
    if (stored.explanationType !== "explainFunction") {
      return undefined;
    }
    if (stored.contentHash !== contentHash) {
      return undefined;
    }
    const ttlMs = this.getCacheTtlMs();
    if (ttlMs > 0) {
      const createdMs = Date.parse(stored.createdAt);
      if (Number.isFinite(createdMs) && Date.now() - createdMs > ttlMs) {
        return undefined;
      }
    }
    return { result: stored.result as ExplainFunctionResult, stored };
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

  private async callProviderRaw(
    selection: SelectedModel,
    prompt: string,
    signal?: AbortSignal
  ): Promise<{ text: string; tokenUsage?: TokenUsage }> {
    const provider = createProviderForSelection(selection);
    if (provider.streamRaw) {
      let accumulated = "";
      await provider.streamRaw(prompt, {
        onChunk: (chunk) => { accumulated += chunk; },
        onDone: () => {},
        onError: () => {}
      }, { signal });
      return { text: accumulated, tokenUsage: provider.tokenUsage };
    }

    const dummyInput = {
      workspaceRoot: "", filePath: "", language: "", symbolName: "",
      symbolKind: "function" as const, code: prompt, imports: [],
      callers: [], callees: [], nearbySymbols: [],
      contentHash: "", dependencyHash: "",
      range: { startLine: 0, endLine: 0 }
    };
    const result = await provider.explainFunction(dummyInput, { signal });
    return { text: JSON.stringify(result), tokenUsage: provider.tokenUsage };
  }

  private getCacheTtlMs(): number {
    return this.config.cacheTtlSeconds > 0 ? this.config.cacheTtlSeconds * 1000 : 0;
  }

  private buildPresentation(cacheHit: boolean, record: StoredExplanation): ExplanationPresentation {
    return {
      cacheHit,
      cacheLabel: `${cacheHit ? "Cached" : "Generated"}`,
      modelName: record.modelName,
      provider: record.provider,
      providerLabel: PROVIDER_DISPLAY_NAMES[record.provider],
      createdAt: record.createdAt
    };
  }

  private async withInFlightDedup<T>(
    lookup: ExplanationLookup,
    loader: () => Promise<ExplanationResponse<T>>,
    signal?: AbortSignal
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

    const request = this.runDebounced(loader, signal);
    this.inFlightRequests.set(key, request);
    try {
      return await request;
    } finally {
      this.inFlightRequests.delete(key);
    }
  }

  private async runDebounced<T>(loader: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      throw new DOMException("Generation aborted", "AbortError");
    }
    if (this.config.selectionDebounceMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.config.selectionDebounceMs);
      });
    }
    if (signal?.aborted) {
      throw new DOMException("Generation aborted", "AbortError");
    }
    return loader();
  }
}

function parseIncrementalResult(raw: string, fallback: ExplainFunctionResult, modelName?: string): ExplainFunctionResult {
  const parsed = parseKYCResponse<Record<string, unknown>>(raw, {
    modelName,
    context: "incremental-explain-result",
    expectedShape: (value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)),
    fallbackFactory: () => ({})
  }).parsed;
  if (!parsed || Object.keys(parsed).length === 0) {
    return fallback;
  }

  return {
    summary: String(parsed.summary ?? fallback.summary),
    purpose: String(parsed.purpose ?? fallback.purpose),
    stepByStep: Array.isArray(parsed.stepByStep) ? parsed.stepByStep.map(String) : fallback.stepByStep,
    inputs: Array.isArray(parsed.inputs) ? parsed.inputs.map(String) : fallback.inputs,
    outputs: Array.isArray(parsed.outputs) ? parsed.outputs.map(String) : fallback.outputs,
    dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies.map(String) : fallback.dependencies,
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : (fallback.risks ?? []),
    connectedFlow: Array.isArray(parsed.connectedFlow) ? parsed.connectedFlow.map(String) : (fallback.connectedFlow ?? []),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : (fallback.confidence ?? 0)
  };
}

function parseLineResult(raw: string, modelName?: string): ExplainLineResult {
  const parsedResult = parseKYCResponse<Record<string, unknown>>(raw, {
    modelName,
    context: "line-explain-result",
    expectedShape: (value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)),
    fallbackFactory: () => ({})
  });
  if (!parsedResult.usedFallback) {
    const parsed = parsedResult.parsed;
    const fallbackText = String(parsed.content ?? raw).trim();
    return {
      lineExplanation: String(parsed.lineExplanation ?? parsed.explanation ?? parsed.summary ?? ""),
      whyItMatters: String(parsed.whyItMatters ?? parsed.importance ?? parsed.purpose ?? ""),
      technicalDetail: String(parsed.technicalDetail ?? parsed.technical ?? parsed.content ?? fallbackText),
      relatedConcepts: Array.isArray(parsed.relatedConcepts) ? parsed.relatedConcepts.map(String) : []
    };
  }

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return {
    lineExplanation: cleaned.split("\n")[0] || "Unable to parse line explanation.",
    whyItMatters: "",
    technicalDetail: cleaned,
    relatedConcepts: []
  };
}

function parseCallFlowResult(raw: string, modelName?: string): ExplainCallFlowResult {
  const parsedResult = parseKYCResponse<Record<string, unknown>>(raw, {
    modelName,
    context: "callflow-explain-result",
    expectedShape: (value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)),
    fallbackFactory: () => ({})
  });
  if (!parsedResult.usedFallback) {
    const parsed = parsedResult.parsed;
    return {
      overview: String(parsed.overview ?? parsed.summary ?? ""),
      flowSteps: ensureStringArray(parsed.flowSteps),
      dataFlow: ensureStringArray(parsed.dataFlow),
      entryPoints: ensureStringArray(parsed.entryPoints),
      exitPoints: ensureStringArray(parsed.exitPoints),
      sideEffects: ensureStringArray(parsed.sideEffects),
      edgeCases: ensureStringArray(parsed.edgeCases)
    };
  }

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
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
