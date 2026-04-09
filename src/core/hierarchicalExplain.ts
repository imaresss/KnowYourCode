import * as path from "path";
import { ExplanationOrchestrator } from "./orchestrator";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { resolveCalleeContexts } from "../intelligence/symbolResolver";
import {
  ChildExplanation,
  HierarchicalExplanationResult,
  ExplainFunctionResult,
  ExplanationPresentation,
  RelatedSymbol,
  SelectedModel,
  SymbolContext,
  TokenUsage
} from "./types";
import { logInfo, logError } from "../utils/logger";

const MAX_CHILDREN = 8;

export interface HierarchicalExplainOptions {
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

export interface HierarchicalExplainResponse {
  hierarchical: HierarchicalExplanationResult;
  meta: ExplanationPresentation;
  childTokenUsage?: TokenUsage;
}

export async function explainFunctionHierarchical(
  orchestrator: ExplanationOrchestrator,
  context: SymbolContext,
  selection: SelectedModel,
  options: HierarchicalExplainOptions = {}
): Promise<HierarchicalExplainResponse> {
  const input = buildExplainFunctionInput(context);

  const { result: parentResult, meta: parentMeta } = await orchestrator.explainFunction(
    input,
    selection,
    { forceRefresh: options.forceRefresh, signal: options.signal }
  );

  void orchestrator.prefetchConnectedContexts(context, selection);

  const children = await resolveAndExplainChildren(
    orchestrator,
    context.callees,
    context.symbolName,
    selection,
    options.signal
  );

  const childTokens = aggregateChildTokenUsage(children, parentMeta.tokenUsage);

  return {
    hierarchical: {
      parent: parentResult,
      parentSource: parentMeta.cacheHit ? "cache" : "generated",
      children,
      depth: 1
    },
    meta: parentMeta,
    childTokenUsage: childTokens
  };
}

export async function explainChildFunctions(
  orchestrator: ExplanationOrchestrator,
  callees: RelatedSymbol[],
  parentSymbolName: string,
  selection: SelectedModel,
  signal?: AbortSignal
): Promise<ChildExplanation[]> {
  return resolveAndExplainChildren(orchestrator, callees, parentSymbolName, selection, signal);
}

async function resolveAndExplainChildren(
  orchestrator: ExplanationOrchestrator,
  callees: RelatedSymbol[],
  parentSymbolName: string,
  selection: SelectedModel,
  signal?: AbortSignal
): Promise<ChildExplanation[]> {
  if (!callees.length) {
    return [];
  }

  const uniqueCallees = deduplicateCallees(callees, parentSymbolName);
  if (!uniqueCallees.length) {
    return [];
  }

  logInfo(`Resolving ${uniqueCallees.length} child function(s) for ${parentSymbolName}`);

  const childContexts = await resolveCalleeContexts(uniqueCallees, MAX_CHILDREN);
  const resolvedNames = new Set(childContexts.keys());

  const settledResults = await Promise.allSettled(
    [...childContexts.entries()].map(([name, ctx]) =>
      explainSingleChild(orchestrator, name, ctx, selection, signal)
    )
  );

  const children: ChildExplanation[] = [];

  for (const settled of settledResults) {
    if (settled.status === "fulfilled") {
      children.push(settled.value);
    } else {
      logError(`Child explain rejected: ${settled.reason}`);
    }
  }

  for (const callee of uniqueCallees) {
    if (!resolvedNames.has(callee.name)) {
      children.push({
        symbolName: callee.name,
        filePath: callee.filePath,
        source: "external",
        signature: callee.signature
      });
    }
  }

  const cacheCount = children.filter((c) => c.source === "cache").length;
  const genCount = children.filter((c) => c.source === "generated").length;
  const skipCount = children.filter((c) => c.source === "skipped" || c.source === "external").length;
  logInfo(`Child explanations: ${cacheCount} cached, ${genCount} generated, ${skipCount} skipped/external`);

  return children;
}

async function explainSingleChild(
  orchestrator: ExplanationOrchestrator,
  name: string,
  ctx: SymbolContext,
  selection: SelectedModel,
  signal?: AbortSignal
): Promise<ChildExplanation> {
  if (signal?.aborted) {
    return {
      symbolName: name,
      filePath: ctx.filePath,
      source: "skipped",
      signature: ctx.signature,
      error: "Aborted"
    };
  }

  try {
    const childInput = buildExplainFunctionInput(ctx);
    const { result, meta } = await orchestrator.explainFunction(childInput, selection, { signal });
    return {
      symbolName: name,
      filePath: ctx.filePath,
      source: meta.cacheHit ? "cache" : "generated",
      result,
      signature: ctx.signature
    };
  } catch (error) {
    return {
      symbolName: name,
      filePath: ctx.filePath,
      source: "skipped",
      signature: ctx.signature,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function deduplicateCallees(callees: RelatedSymbol[], parentName: string): RelatedSymbol[] {
  const seen = new Set<string>();
  const unique: RelatedSymbol[] = [];

  for (const callee of callees) {
    if (callee.name === parentName) {
      continue;
    }
    const key = `${callee.name}::${callee.filePath}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(callee);
  }

  return unique.slice(0, MAX_CHILDREN);
}

function aggregateChildTokenUsage(
  children: ChildExplanation[],
  _parentTokenUsage?: TokenUsage
): TokenUsage | undefined {
  let prompt = 0;
  let completion = 0;
  const generated = children.filter((c) => c.source === "generated");
  if (generated.length === 0) {
    return undefined;
  }
  for (const _child of generated) {
    prompt += 200;
    completion += 400;
  }
  return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
}

export function childFileBadge(filePath: string): string {
  return path.basename(filePath);
}
