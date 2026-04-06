import { ExplainFunctionResult } from "../core/types";

export function normalizeExplanationResult(payload: unknown): ExplainFunctionResult {
  if (isExplainFunctionResult(payload)) {
    return {
      ...payload,
      stepByStep: ensureArray(payload.stepByStep),
      inputs: ensureArray(payload.inputs),
      outputs: ensureArray(payload.outputs),
      dependencies: ensureArray(payload.dependencies),
      risks: ensureArray(payload.risks),
      connectedFlow: ensureArray(payload.connectedFlow),
      confidence: normalizeConfidence(payload.confidence)
    };
  }

  if (typeof payload === "string") {
    return fallbackFromText(payload);
  }

  return fallbackFromText(JSON.stringify(payload, null, 2));
}

function isExplainFunctionResult(value: unknown): value is ExplainFunctionResult {
  return typeof value === "object" && value !== null && "summary" in value && "purpose" in value;
}

function ensureArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return 0.5;
}

function fallbackFromText(text: string): ExplainFunctionResult {
  const cleaned = text.trim();
  return {
    summary: cleaned.split(/\r?\n/, 1)[0] || "Function explanation",
    purpose: cleaned || "The model returned an unstructured explanation.",
    stepByStep: [],
    inputs: [],
    outputs: [],
    dependencies: [],
    risks: [],
    connectedFlow: [],
    confidence: 0.35
  };
}
