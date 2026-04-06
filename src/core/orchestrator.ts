import { ExplanationRepository } from "../cache/explanationRepo";
import { ExtensionConfig } from "./config";
import {
  ConnectedCallsSnapshot,
  ExplainFunctionInput,
  ExplainFunctionOptions,
  ExplainFunctionResult,
  StoredExplanation,
  SymbolContext
} from "./types";
import { buildSymbolKey } from "../intelligence/fingerprint";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { resolveConnectedSymbolContexts } from "../intelligence/symbolResolver";
import { ModelProvider } from "../providers/modelProvider";

export class ExplanationOrchestrator {
  public constructor(
    private readonly repo: ExplanationRepository,
    private readonly config: ExtensionConfig,
    private readonly provider: ModelProvider
  ) {}

  public async explainFunction(
    input: ExplainFunctionInput,
    options: ExplainFunctionOptions = {}
  ): Promise<{
    result: ExplainFunctionResult;
    cacheHit: boolean;
  }> {
    const symbolKey = buildSymbolKey(input);
    if (options.forceRefresh) {
      this.repo.invalidateSymbol(symbolKey);
    }

    const existing = options.forceRefresh
      ? undefined
      : this.repo.findValid({
          symbolKey,
          contentHash: input.contentHash,
          dependencyHash: input.dependencyHash,
          modelName: this.config.modelName,
          providerMode: this.config.providerMode,
          promptVersion: this.config.promptVersion
        });

    if (existing) {
      return { result: existing.result, cacheHit: true };
    }

    const result = await this.provider.explainFunction(input);
    this.repo.replaceCallEdges(symbolKey, input.callees);
    const record: StoredExplanation = {
      symbolKey,
      explanationType: "function",
      contentHash: input.contentHash,
      dependencyHash: input.dependencyHash,
      modelName: this.config.modelName,
      providerMode: this.config.providerMode,
      promptVersion: this.config.promptVersion,
      result,
      createdAt: new Date().toISOString()
    };
    this.repo.save(record);
    return { result, cacheHit: false };
  }

  public invalidateSymbol(symbolKey: string): void {
    this.repo.invalidateSymbol(symbolKey);
  }

  public invalidateFile(filePath: string): void {
    this.repo.invalidateFile(filePath);
  }

  public async prefetchConnectedContexts(context: SymbolContext): Promise<void> {
    if (!this.config.prefetchConnectedCalls) {
      return;
    }

    const connectedContexts = await resolveConnectedSymbolContexts(context);
    for (const related of connectedContexts.slice(0, 4)) {
      const input = buildExplainFunctionInput(related);
      try {
        await this.explainFunction(input);
      } catch {
        // background prefetch should never interrupt the user's main action
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
}
