import { ExplainFunctionInput } from "../core/types";

export function buildExplainFunctionPrompt(input: ExplainFunctionInput): string {
  return [
    "You are explaining code for a developer.",
    "Return JSON only with keys: summary, purpose, stepByStep, inputs, outputs, dependencies, risks, connectedFlow, confidence.",
    `Function name: ${input.symbolName}`,
    `Language: ${input.language}`,
    `File: ${input.filePath}`,
    `Signature: ${input.signature ?? "unknown"}`,
    `Container: ${input.containerName ?? "none"}`,
    "",
    "Imports:",
    ...input.imports.slice(0, 20),
    "",
    "Callers:",
    ...input.callers.map((item) => `- ${item.name} ${item.signature ?? ""}`),
    "",
    "Callees:",
    ...input.callees.map((item) => `- ${item.name} ${item.signature ?? ""}`),
    "",
    "Nearby symbols:",
    ...input.nearbySymbols.map((item) => `- ${item.name} ${item.signature ?? ""}`),
    "",
    "Function code:",
    input.code
  ].join("\n");
}
