import { ExplanationOrchestrator } from "./orchestrator";
import {
  ExplainFunctionResult,
  ExplanationPresentation,
  SymbolContext
} from "./types";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { buildSymbolKey } from "../intelligence/fingerprint";
import { PROVIDER_DISPLAY_NAMES } from "../providers/providerFactory";
import { logInfo } from "../utils/logger";

export interface CacheReusedResult {
  markdown: string;
  meta: ExplanationPresentation;
  functionName: string;
}

/**
 * Attempt to reuse a cached function-level explanation for a code selection
 * that falls inside that function. Returns undefined if no usable cache exists.
 */
export function tryReuseFunctionCache(
  orchestrator: ExplanationOrchestrator,
  enclosingFunction: SymbolContext,
  selectionRange: { startLine: number; endLine: number },
  selectedCode: string
): CacheReusedResult | undefined {
  const input = buildExplainFunctionInput(enclosingFunction);
  const symbolKey = buildSymbolKey(enclosingFunction);
  const cached = orchestrator.findCachedFunctionExplanation(symbolKey, input.contentHash);
  if (!cached) {
    return undefined;
  }

  logInfo(
    `Cache reuse hit: "${enclosingFunction.symbolName}" L${selectionRange.startLine}-${selectionRange.endLine}` +
    ` (model=${cached.stored.modelName})`
  );

  const markdown = buildRelevantExplanation(
    cached.result,
    enclosingFunction.symbolName,
    selectionRange,
    enclosingFunction.range.startLine,
    selectedCode
  );

  return {
    markdown,
    meta: {
      cacheHit: true,
      cacheLabel: "Cached (Function-Level)",
      modelName: cached.stored.modelName,
      provider: cached.stored.provider,
      providerLabel: PROVIDER_DISPLAY_NAMES[cached.stored.provider],
      createdAt: cached.stored.createdAt
    },
    functionName: enclosingFunction.symbolName
  };
}

// ---------------------------------------------------------------------------
// Relevant explanation extraction
// ---------------------------------------------------------------------------

function buildRelevantExplanation(
  cached: ExplainFunctionResult,
  functionName: string,
  selectionRange: { startLine: number; endLine: number },
  _functionStartLine: number,
  selectedCode: string
): string {
  const lineMatchedSteps = findStepsByLineRange(cached.stepByStep, selectionRange);
  const identifiers = extractCodeIdentifiers(selectedCode);
  const identifierMatchedSteps = lineMatchedSteps.length > 0
    ? []
    : findStepsByIdentifiers(cached.stepByStep, identifiers, lineMatchedSteps);

  const relevantSteps = lineMatchedSteps.length > 0 ? lineMatchedSteps : identifierMatchedSteps;
  const useFullSteps = relevantSteps.length === 0;
  const stepsToShow = useFullSteps ? cached.stepByStep : relevantSteps;

  const relevantInputs = filterByIdentifiers(cached.inputs, identifiers);
  const relevantOutputs = filterByIdentifiers(cached.outputs, identifiers);
  const relevantDeps = filterByIdentifiers(cached.dependencies, identifiers);

  const sections: string[] = [];

  sections.push("# Selected Code Explanation");
  sections.push(`*Reused from cached explanation of* \`${functionName}\``);

  sections.push("## Context");
  sections.push(`**Function:** \`${functionName}\``);
  sections.push(`**Selection:** Lines ${selectionRange.startLine}–${selectionRange.endLine}`);
  sections.push(cached.purpose);

  if (stepsToShow.length > 0) {
    const heading = useFullSteps
      ? "## Step-by-Step (Full Function)"
      : "## Relevant Steps";
    sections.push(heading);
    sections.push(stepsToShow.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  }

  const inputs = relevantInputs.length > 0 ? relevantInputs : cached.inputs;
  if (inputs.length > 0) {
    sections.push("## Inputs");
    sections.push(inputs.map((item) => `- ${item}`).join("\n"));
  }

  const outputs = relevantOutputs.length > 0 ? relevantOutputs : cached.outputs;
  if (outputs.length > 0) {
    sections.push("## Outputs");
    sections.push(outputs.map((item) => `- ${item}`).join("\n"));
  }

  if (relevantDeps.length > 0) {
    sections.push("## Dependencies");
    sections.push(relevantDeps.map((item) => `- ${item}`).join("\n"));
  }

  if (cached.risks.length > 0) {
    const relevantRisks = filterByIdentifiers(cached.risks, identifiers);
    if (relevantRisks.length > 0) {
      sections.push("## Risks");
      sections.push(relevantRisks.map((item) => `- ${item}`).join("\n"));
    }
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Line-reference matching
// ---------------------------------------------------------------------------

function findStepsByLineRange(
  steps: string[],
  range: { startLine: number; endLine: number }
): string[] {
  return steps.filter((step) => {
    const ref = parseLineReference(step);
    if (!ref) {
      return false;
    }
    return ref.start <= range.endLine && ref.end >= range.startLine;
  });
}

/**
 * Parse line references from step text.
 * Matches: "L15: ...", "**L15**: ...", "L15-L20: ...", "**L15-20**: ..."
 */
function parseLineReference(step: string): { start: number; end: number } | undefined {
  const match = step.match(/\*{0,2}L(\d+)(?:\s*[-–]\s*(?:L)?(\d+))?\*{0,2}\s*:/i);
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : undefined;
}

// ---------------------------------------------------------------------------
// Identifier-based matching
// ---------------------------------------------------------------------------

function findStepsByIdentifiers(
  steps: string[],
  identifiers: string[],
  exclude: string[]
): string[] {
  if (identifiers.length === 0) {
    return [];
  }
  const excludeSet = new Set(exclude);
  return steps.filter((step) => {
    if (excludeSet.has(step)) {
      return false;
    }
    const lower = step.toLowerCase();
    return identifiers.some((id) => lower.includes(id.toLowerCase()));
  });
}

const CODE_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
  "return", "throw", "try", "catch", "finally", "new", "delete", "typeof",
  "instanceof", "void", "in", "of", "let", "const", "var", "function",
  "class", "extends", "implements", "import", "export", "from", "default",
  "async", "await", "yield", "this", "super", "true", "false", "null",
  "undefined", "NaN", "Infinity", "console", "window", "document",
  "string", "number", "boolean", "object", "any", "type", "interface"
]);

function extractCodeIdentifiers(code: string): string[] {
  const ids = new Set<string>();
  for (const match of code.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]{2,})\b/g)) {
    if (!CODE_KEYWORDS.has(match[1])) {
      ids.add(match[1]);
    }
  }
  return [...ids];
}

function filterByIdentifiers(items: string[], identifiers: string[]): string[] {
  if (identifiers.length === 0) {
    return [];
  }
  return items.filter((item) => {
    const lower = item.toLowerCase();
    return identifiers.some((id) => lower.includes(id.toLowerCase()));
  });
}
