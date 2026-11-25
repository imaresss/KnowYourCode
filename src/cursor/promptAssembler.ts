import type { SymbolContext } from "../core/types";
import type { KycInteractionContext } from "../context/interactionContext";
import { EXPLANATION_POLICY } from "../core/explanationPolicy";

// JSON keeps code, including backticks and partial expressions, intact as data.
function snapshot(code: string, language: string): string {
  return `Target snapshot (JSON data):\n${JSON.stringify({ language, code })}`;
}

function symbolPrompt(skill: string, ctx: SymbolContext): string {
  // Installed skills supply the explanation rules and read the referenced code.
  // Keep annotation handoffs compact while retaining an unambiguous file path.
  return `/${skill} ${inlineReference(ctx.symbolName)} in ${inlineReference(ctx.filePath)} (lines ${ctx.range.startLine}–${ctx.range.endLine})`;
}

function inlineReference(value: string): string {
  return /[`\r\n]/.test(value) ? JSON.stringify(value) : `\`${value}\``;
}

export function buildCursorExplainFunctionPrompt(ctx: SymbolContext): string {
  return symbolPrompt("kyc-explain-function", ctx);
}

export function buildCursorExplainLinePrompt(
  filePath: string,
  language: string,
  lineText: string,
  lineNumber: number,
  enclosingName: string,
  enclosingCode: string
): string {
  return [
    `/kyc-explain-selected Line ${lineNumber} in ${JSON.stringify(filePath)} (inside ${JSON.stringify(enclosingName)})`,
    EXPLANATION_POLICY,
    "Explain only the target line; surrounding code is context, not additional scope.",
    snapshot(lineText, language),
    `Enclosing code (JSON data): ${JSON.stringify(enclosingCode)}`
  ].join("\n\n");
}

export function buildCursorExplainCallFlowPrompt(ctx: SymbolContext): string {
  return symbolPrompt("kyc-explain-callflow", ctx);
}

export function buildCursorSuggestTestsPrompt(ctx: SymbolContext): string {
  return symbolPrompt("kyc-suggest-tests", ctx);
}

export function buildCursorExplainWithCalleesPrompt(ctx: SymbolContext): string {
  return buildCursorExplainCallFlowPrompt(ctx);
}

export function buildCursorContextActionPrompt(
  _actionId: string,
  context: KycInteractionContext
): string {
  const enclosing = context.enclosingFunction ?? context.symbolContext;
  const range = context.sourceRange;
  return [
    `/kyc-explain-selected in ${JSON.stringify(context.filePath)}`,
    range
      ? `Selection (1-based lines and columns; end exclusive): ${JSON.stringify(range)}`
      : `Starts at line ${context.anchorLine + 1}`,
    enclosing ? `Enclosing function: ${JSON.stringify(enclosing.symbolName)}` : "",
    "Explain precisely the target selection; surrounding code only clarifies it.",
    EXPLANATION_POLICY,
    snapshot(context.code, context.language)
  ].filter(Boolean).join("\n\n");
}
