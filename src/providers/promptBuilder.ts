import { ExplainCallFlowInput, ExplainFunctionInput, ExplainLineInput } from "../core/types";

export function buildExplainFunctionPrompt(input: ExplainFunctionInput): string {
  return [
    SYSTEM_PREAMBLE,
    "",
    "Return a JSON object with EXACTLY these keys:",
    '  "summary": brief one-line summary of what this function does',
    '  "purpose": why this code exists and what problem it solves (2-3 sentences)',
    '  "stepByStep": array of strings, each explaining one logical step in the function (beginner-friendly)',
    '  "inputs": array describing each parameter/input and its purpose',
    '  "outputs": array describing return values and side effects',
    '  "dependencies": array of external functions, modules, or APIs this code relies on',
    "",
    "IMPORTANT GUIDELINES:",
    "- stepByStep should be understandable by a junior developer who has never seen this code",
    "- Each step should explain WHAT happens AND WHY it happens",
    "- Mention variable names and values where relevant",
    "- If there are error handling paths, explain them separately",
    "- IMPORTANT: Whenever you explain a specific line, property, or statement, prefix that step with the exact file line number in this format: `L<number>:` or `L<start>-L<end>:` (use the file line numbers from the provided Lines range).",
    "",
    `--- CODE CONTEXT ---`,
    `Function: ${input.symbolName}`,
    `Language: ${input.language}`,
    `File: ${input.filePath}`,
    `Signature: ${input.signature ?? "N/A"}`,
    `Container: ${input.containerName ?? "top-level"}`,
    `Lines: ${input.range.startLine}-${input.range.endLine}`,
    "",
    "Imports:",
    ...(input.imports.length ? input.imports.slice(0, 20) : ["(none)"]),
    "",
    "Callers (who calls this function):",
    ...(input.callers.length
      ? input.callers.map((c) => `  - ${c.name}${c.signature ? ` | ${c.signature}` : ""}`)
      : ["  (no callers detected)"]),
    "",
    "Callees (what this function calls):",
    ...(input.callees.length
      ? input.callees.map((c) => `  - ${c.name}${c.signature ? ` | ${c.signature}` : ""}`)
      : ["  (no callees detected)"]),
    "",
    "Nearby symbols in the same file:",
    ...(input.nearbySymbols.length
      ? input.nearbySymbols.slice(0, 8).map((s) => `  - ${s.name}`)
      : ["  (none)"]),
    "",
    "--- FUNCTION CODE ---",
    input.code
  ].join("\n");
}

export function buildExplainLinePrompt(input: ExplainLineInput): string {
  return [
    SYSTEM_PREAMBLE,
    "",
    "You are explaining a SINGLE LINE of code within a function.",
    "",
    "Return a JSON object with EXACTLY these keys:",
    '  "lineExplanation": beginner-friendly explanation of what this specific line does (2-3 sentences)',
    '  "whyItMatters": why this line is important in the context of the function (1-2 sentences)',
    '  "technicalDetail": deeper technical explanation for experienced developers (2-3 sentences)',
    '  "relatedConcepts": array of programming concepts this line demonstrates (e.g., "destructuring", "async/await", "error handling")',
    "",
    `--- CONTEXT ---`,
    `File: ${input.filePath}`,
    `Language: ${input.language}`,
    `Enclosing function: ${input.enclosingSymbolName}`,
    `Line number: ${input.lineNumber}`,
    "",
    `Target line: ${input.lineText}`,
    "",
    "Imports:",
    ...(input.imports.length ? input.imports.slice(0, 15) : ["(none)"]),
    "",
    "--- ENCLOSING FUNCTION CODE ---",
    input.enclosingCode
  ].join("\n");
}

export function buildExplainCallFlowPrompt(input: ExplainCallFlowInput): string {
  return [
    SYSTEM_PREAMBLE,
    "",
    "You are explaining the CALL FLOW — how execution moves through this function and its connections.",
    "",
    "Return a JSON object with EXACTLY these keys:",
    '  "overview": high-level summary of the entire flow (2-3 sentences)',
    '  "flowSteps": array of strings describing the execution flow step-by-step, including function entries and exits (prefix steps with `L<number>:` when referencing specific lines)',
    '  "dataFlow": array describing how data is transformed as it moves through the call chain',
    '  "entryPoints": array of ways this function can be triggered/called',
    '  "exitPoints": array of ways this function can end (return, throw, etc.)',
    '  "sideEffects": array of external state changes this flow causes (DB writes, API calls, DOM mutations, etc.)',
    "",
    `--- CONTEXT ---`,
    `Function: ${input.symbolName} (${input.symbolKind})`,
    `Language: ${input.language}`,
    `File: ${input.filePath}`,
    "",
    "Callers:",
    ...(input.callers.length
      ? input.callers.map((c) => `  - ${c.name}${c.signature ? ` | ${c.signature}` : ""}${c.snippet ? `\n    ${c.snippet.split("\n")[0]}` : ""}`)
      : ["  (no callers detected)"]),
    "",
    "Callees:",
    ...(input.callees.length
      ? input.callees.map((c) => `  - ${c.name}${c.signature ? ` | ${c.signature}` : ""}${c.snippet ? `\n    ${c.snippet.split("\n")[0]}` : ""}`)
      : ["  (no callees detected)"]),
    "",
    "--- FUNCTION CODE ---",
    input.code
  ].join("\n");
}

const SYSTEM_PREAMBLE = [
  "You are a senior code analyst explaining code to developers of all experience levels.",
  "Your explanations must be:",
  "  1. Accurate and technically precise",
  "  2. Accessible to beginners (avoid jargon without definition)",
  "  3. Comprehensive (cover purpose, logic, edge cases)",
  "  4. Actionable (help the reader understand AND modify the code confidently)",
  "",
  "Return ONLY valid JSON. No markdown fences, no commentary outside the JSON."
].join("\n");
