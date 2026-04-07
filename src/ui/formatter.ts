import * as path from "path";
import {
  ConnectedCallsSnapshot,
  ExplainCallFlowResult,
  ExplainFunctionResult,
  ExplainLineResult,
  RelatedSymbol
} from "../core/types";

export function formatExplanationMarkdown(result: ExplainFunctionResult): string {
  const sections: string[] = [];

  sections.push(`# ${result.summary}`);

  sections.push("## Purpose");
  sections.push(result.purpose);

  sections.push("## Step-by-Step Walkthrough");
  const steps = result.stepByStep.length ? result.stepByStep : ["No detailed execution steps were returned."];
  sections.push(steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));

  sections.push("## Inputs");
  const inputs = result.inputs.length ? result.inputs : ["No explicit inputs were identified."];
  sections.push(inputs.map((item) => `- ${item}`).join("\n"));

  sections.push("## Outputs");
  const outputs = result.outputs.length ? result.outputs : ["No explicit outputs were identified."];
  sections.push(outputs.map((item) => `- ${item}`).join("\n"));

  sections.push("## Dependencies");
  const deps = result.dependencies.length ? result.dependencies : ["No direct dependencies were identified."];
  sections.push(deps.map((item) => `- ${item}`).join("\n"));

  sections.push("## Connected Flow");
  const flow = result.connectedFlow.length ? result.connectedFlow : ["No connected flow details were returned."];
  sections.push(flow.map((item) => `- ${item}`).join("\n"));

  sections.push("## Risks & Edge Cases");
  const risks = result.risks.length ? result.risks : ["No obvious risks were identified."];
  sections.push(risks.map((item) => `- ⚠ ${item}`).join("\n"));

  const confidencePct = Math.round(result.confidence * 100);
  const bar = "█".repeat(Math.round(confidencePct / 5)) + "░".repeat(20 - Math.round(confidencePct / 5));
  sections.push(`---\n**Confidence:** ${bar} ${confidencePct}%`);

  return sections.join("\n\n");
}

export function formatLineExplanationMarkdown(
  result: ExplainLineResult,
  lineText: string,
  lineNumber: number,
  enclosingFunction: string
): string {
  const sections: string[] = [];

  sections.push(`# Line ${lineNumber} Explanation`);
  sections.push(`\`\`\`\n${lineText}\n\`\`\``);
  sections.push(`*Inside function:* \`${enclosingFunction}\``);

  sections.push("## What This Line Does");
  sections.push(result.lineExplanation || "No explanation available.");

  sections.push("## Why It Matters");
  sections.push(result.whyItMatters || "Context not available.");

  sections.push("## Technical Detail");
  sections.push(result.technicalDetail || "No additional technical detail.");

  if (result.relatedConcepts.length) {
    sections.push("## Related Concepts");
    sections.push(result.relatedConcepts.map((c) => `- ${c}`).join("\n"));
  }

  return sections.join("\n\n");
}

export function formatCallFlowMarkdown(
  result: ExplainCallFlowResult,
  symbolName: string
): string {
  const sections: string[] = [];

  sections.push(`# Call Flow: ${symbolName}`);
  sections.push(result.overview || "No overview available.");

  sections.push("## Execution Flow");
  const flowSteps = result.flowSteps.length ? result.flowSteps : ["No flow steps identified."];
  sections.push(flowSteps.map((s, i) => `${i + 1}. ${s}`).join("\n"));

  sections.push("## Data Flow");
  const dataFlow = result.dataFlow.length ? result.dataFlow : ["No data flow information."];
  sections.push(dataFlow.map((d) => `- ${d}`).join("\n"));

  sections.push("## Entry Points");
  const entries = result.entryPoints.length ? result.entryPoints : ["No entry points identified."];
  sections.push(entries.map((e) => `- ${e}`).join("\n"));

  sections.push("## Exit Points");
  const exits = result.exitPoints.length ? result.exitPoints : ["No exit points identified."];
  sections.push(exits.map((e) => `- ${e}`).join("\n"));

  if (result.sideEffects.length) {
    sections.push("## Side Effects");
    sections.push(result.sideEffects.map((s) => `- ⚡ ${s}`).join("\n"));
  }

  if (result.edgeCases.length) {
    sections.push("## Edge Cases");
    sections.push(result.edgeCases.map((e) => `- ⚠ ${e}`).join("\n"));
  }

  return sections.join("\n\n");
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
    `File: \`${snapshot.filePath}\``,
    "",
    "## Callers (who calls this)",
    ...callers.map((item) => `- ${item}`),
    "",
    "## Direct Callees (what this calls)",
    ...liveCallees.map((item) => `- ${item}`),
    "",
    "## Cached Call Graph",
    ...cachedCallees.map((item) => `- ${item}`)
  ].join("\n");
}

function formatRelatedSymbol(symbol: RelatedSymbol): string {
  const file = path.basename(symbol.filePath);
  return `\`${symbol.name}\`${symbol.signature ? ` — ${symbol.signature}` : ""} *(${file})*`;
}
