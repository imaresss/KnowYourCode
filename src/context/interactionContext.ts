import * as vscode from "vscode";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { buildSymbolKey } from "../intelligence/fingerprint";
import { resolveEnclosingSymbolContext } from "../intelligence/symbolResolver";
import { SymbolContext } from "../core/types";
import { sha256 } from "../utils/hash";

export type InteractionMode = "selection" | "cursor";
export type SelectionKind = "singleLine" | "multiLine" | "fullFunction";
export type LogicalScope = "function" | "block" | "line";

export interface KycInteractionContext {
  mode: InteractionMode;
  scope: LogicalScope;
  filePath: string;
  language: string;
  code: string;
  key: string;
  contentHash: string;
  dependencyHash: string;
  displayName: string;
  anchorLine: number;
  symbolContext?: SymbolContext;
  selectionKind?: SelectionKind;
  /** Always set when the selection/cursor is inside a function, regardless of selectionKind. */
  enclosingFunction?: SymbolContext;
}

export async function resolveInteractionContext(
  editor: vscode.TextEditor
): Promise<KycInteractionContext | undefined> {
  const document = editor.document;
  const selection = editor.selection;

  if (!selection.isEmpty) {
    const code = document.getText(selection).trim();
    if (!code) {
      return undefined;
    }

    const enclosing = await resolveEnclosingSymbolContext(editor);
    const selectionKind = detectSelectionKind(document, selection, code, enclosing);
    const contentHash = sha256(code);
    const dependencyHash = enclosing ? buildExplainFunctionInput(enclosing).dependencyHash : "";
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;

    return {
      mode: "selection",
      scope: selectionKind === "singleLine" ? "line" : selectionKind === "fullFunction" ? "function" : "block",
      filePath: document.uri.fsPath,
      language: document.languageId,
      code,
      key: `selection::${document.uri.fsPath}::${startLine}-${endLine}::${selection.start.character}-${selection.end.character}`,
      contentHash,
      dependencyHash,
      displayName: selectionKind === "fullFunction" && enclosing
        ? enclosing.symbolName
        : `Selection (${Math.max(1, endLine - startLine + 1)} line${endLine === startLine ? "" : "s"})`,
      anchorLine: selection.start.line,
      symbolContext: selectionKind === "fullFunction" ? enclosing ?? undefined : undefined,
      selectionKind,
      enclosingFunction: enclosing ?? undefined
    };
  }

  const symbolContext = await resolveEnclosingSymbolContext(editor);
  if (!symbolContext) {
    return undefined;
  }

  const explainInput = buildExplainFunctionInput(symbolContext);
  return {
    mode: "cursor",
    scope: symbolContext.symbolKind === "unknown" ? "block" : "function",
    filePath: symbolContext.filePath,
    language: symbolContext.language,
    code: symbolContext.code,
    key: buildSymbolKey(symbolContext),
    contentHash: explainInput.contentHash,
    dependencyHash: explainInput.dependencyHash,
    displayName: symbolContext.symbolName,
    anchorLine: Math.max(0, symbolContext.range.startLine - 1),
    symbolContext,
    enclosingFunction: symbolContext
  };
}

function detectSelectionKind(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  selectedCode: string,
  enclosing?: SymbolContext
): SelectionKind {
  if (selection.start.line === selection.end.line) {
    return "singleLine";
  }

  if (enclosing && sameNormalizedCode(selectedCode, enclosing.code)) {
    return "fullFunction";
  }

  const selectedRange = new vscode.Range(selection.start, selection.end);
  if (
    enclosing &&
    selectedRange.start.line <= enclosing.range.startLine - 1 &&
    selectedRange.end.line >= enclosing.range.endLine - 1 &&
    sameNormalizedCode(selectedCode, enclosing.code)
  ) {
    return "fullFunction";
  }

  return "multiLine";
}

function sameNormalizedCode(left: string, right: string): boolean {
  return normalizeCode(left) === normalizeCode(right);
}

function normalizeCode(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
