import { ExplainFunctionResult, ExplainLineResult } from "../core/types";

interface ParsedLineRef {
  startLine: number;
  endLine: number;
}

/**
 * Parse `L<number>:` or `L<start>-L<end>:` prefix from a stepByStep entry.
 * Returns undefined if the step has no line reference.
 */
function parseLineRef(step: string): ParsedLineRef | undefined {
  const match = step.match(/^L(\d+)(?:-L?(\d+))?:/i);
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return { startLine: start, endLine: end };
}

function rangesOverlap(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Find all stepByStep entries whose line references overlap the given range.
 */
export function matchStepsByLineRange(
  steps: string[],
  startLine: number,
  endLine: number
): string[] {
  return steps.filter((step) => {
    const ref = parseLineRef(step);
    if (!ref) {
      return false;
    }
    return rangesOverlap(ref.startLine, ref.endLine, startLine, endLine);
  });
}

function stripLinePrefix(step: string): string {
  return step.replace(/^L\d+(?:-L?\d+)?:\s*/i, "");
}

/**
 * Derive an ExplainLineResult from a cached ExplainFunctionResult by
 * matching stepByStep entries to the requested line range.
 * Returns undefined if no matching steps are found.
 */
export function deriveLineResult(
  funcResult: ExplainFunctionResult,
  startLine: number,
  endLine: number
): ExplainLineResult | undefined {
  const matched = matchStepsByLineRange(funcResult.stepByStep, startLine, endLine);
  if (matched.length === 0) {
    return undefined;
  }

  const lineExplanation = matched.map(stripLinePrefix).join(" ");
  const whyItMatters = funcResult.purpose;

  return {
    lineExplanation,
    whyItMatters,
    technicalDetail: "",
    relatedConcepts: []
  };
}
