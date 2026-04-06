import * as path from "path";
import { ConnectedCallsSnapshot, ExplainFunctionResult, RelatedSymbol } from "../core/types";

export function formatExplanationMarkdown(result: ExplainFunctionResult): string {
  const steps = result.stepByStep.length ? result.stepByStep : ["No detailed execution steps were returned."];
  const inputs = result.inputs.length ? result.inputs : ["No explicit inputs were identified."];
  const outputs = result.outputs.length ? result.outputs : ["No explicit outputs were identified."];
  const dependencies = result.dependencies.length ? result.dependencies : ["No direct dependencies were identified."];
  const flow = result.connectedFlow.length ? result.connectedFlow : ["No connected flow details were returned."];
  const risks = result.risks.length ? result.risks : ["No obvious risks were identified by the model."];
  return [
    `# ${result.summary}`,
    "",
    "## Purpose",
    result.purpose,
    "",
    "## Execution Steps",
    ...steps.map((item) => `- ${item}`),
    "",
    "## Inputs",
    ...inputs.map((item) => `- ${item}`),
    "",
    "## Outputs",
    ...outputs.map((item) => `- ${item}`),
    "",
    "## Dependencies",
    ...dependencies.map((item) => `- ${item}`),
    "",
    "## Connected Flow",
    ...flow.map((item) => `- ${item}`),
    "",
    "## Risks",
    ...risks.map((item) => `- ${item}`),
    "",
    `Confidence: ${result.confidence}`
  ].join("\n");
}

export function formatConnectedCallsMarkdown(snapshot: ConnectedCallsSnapshot): string {
  const callers = snapshot.callers.length
    ? snapshot.callers.map((item) => formatRelatedSymbol(item))
    : ["No callers were identified from current workspace references."];
  const liveCallees = snapshot.callees.length
    ? snapshot.callees.map((item) => formatRelatedSymbol(item))
    : ["No direct callees were identified from the current function."];
  const cachedCallees = snapshot.cachedCallees.length
    ? snapshot.cachedCallees.map((item) => formatRelatedSymbol(item))
    : ["No cached call graph edges are stored yet for this function."];

  return [
    `# Connected Calls: ${snapshot.symbolName}`,
    "",
    `File: ${snapshot.filePath}`,
    "",
    "## Callers",
    ...callers.map((item) => `- ${item}`),
    "",
    "## Direct Callees",
    ...liveCallees.map((item) => `- ${item}`),
    "",
    "## Cached Call Graph",
    ...cachedCallees.map((item) => `- ${item}`)
  ].join("\n");
}

function formatRelatedSymbol(symbol: RelatedSymbol): string {
  const file = path.basename(symbol.filePath);
  return `${symbol.name}${symbol.signature ? ` - ${symbol.signature}` : ""} (${file})`;
}
