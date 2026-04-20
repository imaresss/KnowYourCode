import * as path from "node:path";
import { SymbolContext } from "../core/types";
import { KycInteractionContext } from "../context/interactionContext";

export function buildCursorExplainFunctionPrompt(ctx: SymbolContext): string {
  const file = path.basename(ctx.filePath);
  return `/kyc-explain-function \`${ctx.symbolName}\` in \`${file}\` (lines ${ctx.range.startLine}–${ctx.range.endLine})`;
}

export function buildCursorExplainLinePrompt(
  filePath: string,
  _language: string,
  lineText: string,
  lineNumber: number,
  enclosingName: string,
  _enclosingCode: string
): string {
  const file = path.basename(filePath);
  return `/kyc-explain-line Line ${lineNumber} in \`${file}\` (inside \`${enclosingName}\`): \`${lineText.trim()}\``;
}

export function buildCursorExplainCallFlowPrompt(ctx: SymbolContext): string {
  const file = path.basename(ctx.filePath);
  return `/kyc-explain-callflow \`${ctx.symbolName}\` in \`${file}\` (lines ${ctx.range.startLine}–${ctx.range.endLine})`;
}

export function buildCursorExplainWithCalleesPrompt(ctx: SymbolContext): string {
  const file = path.basename(ctx.filePath);
  const calleeNames = ctx.callees.slice(0, 8).map((c) => c.name).join(", ");
  return `/kyc-explain-with-callees \`${ctx.symbolName}\` in \`${file}\` (lines ${ctx.range.startLine}–${ctx.range.endLine})${calleeNames ? ` — callees: ${calleeNames}` : ""}`;
}

export function buildCursorContextActionPrompt(
  actionId: string,
  context: KycInteractionContext
): string {
  const file = path.basename(context.filePath);
  const symbol = context.symbolContext?.symbolName;
  const ref = symbol ? `\`${symbol}\` in \`${file}\`` : `selected code in \`${file}\``;

  switch (actionId) {
    case "generateApiCurl":
      return `/kyc-generate-api-request Generate one verbose multi-line cURL (absolute URL on the first line, one -H per header from the code, --data-raw for JSON body) from ${ref}. Follow the skill output format exactly.`;
    default:
      return `/kyc-explain-selected ${ref}`;
  }
}
