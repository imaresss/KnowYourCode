import { ExplainFunctionResult, SymbolContext } from "./types";

export function buildFallbackExplanation(
  context: SymbolContext,
  reason: string
): ExplainFunctionResult {
  const inputs = inferInputs(context.signature);
  const outputs = inferOutputs(context.signature);
  const dependencies = context.callees.length
    ? context.callees.map((callee) => callee.name)
    : ["No direct callees were detected from local analysis."];

  return {
    summary: `${context.symbolName} (local fallback)`,
    purpose: [
      "This explanation was generated without a model response.",
      `Reason: ${reason}`,
      `The current symbol appears to be a ${context.symbolKind} in ${context.containerName ?? "the current file"}.`
    ].join(" "),
    stepByStep: [
      `Enter ${context.symbolName}.`,
      ...context.callees.slice(0, 4).map((callee) => `Likely calls ${callee.name}.`),
      `Return from ${context.symbolName}.`
    ],
    inputs,
    outputs,
    dependencies,
    risks: [
      "This is a heuristic fallback — semantic accuracy is lower than a model-backed explanation.",
      "Configure an AI provider to get richer explanations."
    ],
    connectedFlow: [
      ...context.callers.slice(0, 3).map((caller) => `${caller.name} → ${context.symbolName}`),
      ...context.callees.slice(0, 4).map((callee) => `${context.symbolName} → ${callee.name}`)
    ],
    confidence: 0.28
  };
}

function inferInputs(signature?: string): string[] {
  if (!signature || !signature.includes("(") || !signature.includes(")")) {
    return ["Inputs could not be inferred from the signature."];
  }

  const params = signature
    .slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"))
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  return params.length ? params : ["No explicit parameters."];
}

function inferOutputs(signature?: string): string[] {
  if (!signature) {
    return ["Output type could not be inferred."];
  }

  const colonIdx = signature.lastIndexOf(":");
  if (colonIdx >= 0) {
    const returnType = signature.slice(colonIdx + 1).replace(/[{;].*/, "").trim();
    if (returnType) {
      return [`Returns ${returnType}`];
    }
  }

  return ["Output type could not be inferred."];
}
