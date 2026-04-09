import * as path from "path";
import {
  ConnectedCallsSnapshot,
  ExplainCallFlowResult,
  ExplainFunctionResult,
  ExplainLineResult,
  RelatedSymbol
} from "../core/types";

export interface CallGraphContext {
  symbolName: string;
  callers: RelatedSymbol[];
  callees: RelatedSymbol[];
}

export function formatExplanationMarkdown(
  result: ExplainFunctionResult,
  _code?: string,
  _startLine?: number,
  callGraph?: CallGraphContext
): string {
  const sections: string[] = [];

  sections.push(`# ${result.summary}`);

  if (callGraph && (callGraph.callers.length > 0 || callGraph.callees.length > 0)) {
    sections.push(formatCallGraph(callGraph));
  }

  sections.push("## Purpose");
  sections.push(result.purpose);

  sections.push("## Step-by-Step Walkthrough");
  const steps = result.stepByStep.length ? result.stepByStep : ["No detailed execution steps were returned."];
  sections.push(steps.map((s, i) => `${i + 1}. ${formatStepWithLineNumber(s)}`).join("\n"));

  sections.push("## Inputs");
  const inputs = result.inputs.length ? result.inputs : ["No explicit inputs were identified."];
  sections.push(inputs.map((item) => `- ${item}`).join("\n"));

  sections.push("## Outputs");
  const outputs = result.outputs.length ? result.outputs : ["No explicit outputs were identified."];
  sections.push(outputs.map((item) => `- ${item}`).join("\n"));

  sections.push("## Dependencies");
  const deps = result.dependencies.length ? result.dependencies : ["No direct dependencies were identified."];
  sections.push(deps.map((item) => `- ${item}`).join("\n"));

  return sections.join("\n\n");
}

function formatCallGraph(graph: CallGraphContext): string {
  const lines: string[] = [];
  lines.push("## Call Graph");
  lines.push("");

  if (graph.callers.length > 0) {
    lines.push("**Called by:**");
    for (const caller of graph.callers) {
      const file = path.basename(caller.filePath);
      lines.push(`- \`${caller.name}\`${caller.signature ? ` — ${caller.signature}` : ""} *(${file})*`);
    }
    lines.push("");
  }

  lines.push(`**\`${graph.symbolName}\`**`);
  lines.push("");

  if (graph.callees.length > 0) {
    lines.push("**Calls:**");
    for (const callee of graph.callees) {
      const file = path.basename(callee.filePath);
      lines.push(`- \`${callee.name}\`${callee.signature ? ` — ${callee.signature}` : ""} *(${file})*`);
    }
  } else {
    lines.push("*No outgoing calls detected.*");
  }

  return lines.join("\n");
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

  return sections.join("\n\n");
}

function formatStepWithLineNumber(step: string): string {
  const s = String(step ?? "").trim();
  const match = s.match(/^(L\d+(?:-\d+)?):\s*(.+)$/i);
  if (!match) {
    return s;
  }
  const line = match[1].toUpperCase();
  const rest = match[2];
  return `**${line}**: ${rest}`;
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
