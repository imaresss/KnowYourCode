import * as path from "path";
import * as vscode from "vscode";
import { RelatedSymbol, SymbolContext, SymbolKind } from "../core/types";

const MAX_IMPORTS = 40;
const MAX_RELATED = 12;
const KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "typeof",
  "new",
  "await",
  "function",
  "console",
  "super"
]);

export async function resolveCurrentSymbolContext(
  editor: vscode.TextEditor
): Promise<SymbolContext | undefined> {
  const document = editor.document;
  const selection = editor.selection;

  // Path 1: If user has explicitly selected code, use that directly
  if (!selection.isEmpty) {
    return buildSelectionContext(document, selection);
  }

  // Path 2: Use VS Code's document symbol provider (language server)
  const symbolTree = await getDocumentSymbols(document.uri);
  const symbolPath = findInnermostSymbolPath(symbolTree, selection.active.line);
  if (symbolPath.length) {
    return buildSymbolContext(document, symbolPath);
  }

  // Path 3: Text-based fallback for languages without symbol providers,
  //          or when the LS hasn't initialized yet
  return buildFallbackSymbolContext(document, selection.active.line);
}

export async function resolveEnclosingSymbolContext(
  editor: vscode.TextEditor
): Promise<SymbolContext | undefined> {
  const document = editor.document;
  const symbolTree = await getDocumentSymbols(document.uri);
  const symbolPath = findInnermostSymbolPath(symbolTree, editor.selection.active.line);
  if (symbolPath.length) {
    return buildSymbolContext(document, symbolPath);
  }

  return buildFallbackSymbolContext(document, editor.selection.active.line);
}

export async function resolveConnectedSymbolContexts(
  current: SymbolContext
): Promise<SymbolContext[]> {
  const contexts: SymbolContext[] = [];

  for (const callee of current.callees.slice(0, 6)) {
    const uri = vscode.Uri.file(callee.filePath);
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const symbols = await getDocumentSymbols(uri);
      const candidate = flattenSymbols(symbols).find((symbol) => symbol.name === callee.name);
      if (!candidate) {
        continue;
      }
      const pathToSymbol = findPathByRange(symbols, candidate.range, []);
      if (!pathToSymbol.length) {
        continue;
      }
      const context = await buildSymbolContext(document, pathToSymbol);
      if (context) {
        contexts.push(context);
      }
    } catch {
      // best-effort only
    }
  }

  return contexts;
}

// --- Path 1: Selection-based context ---

async function buildSelectionContext(
  document: vscode.TextDocument,
  selection: vscode.Selection
): Promise<SymbolContext | undefined> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return undefined;
  }

  const code = document.getText(selection).trim();
  if (!code) {
    return undefined;
  }

  const symbolName = extractAnyFunctionName(code)
    ?? `selection_L${selection.start.line + 1}`;
  const imports = extractImports(document.getText());

  return {
    workspaceRoot: workspaceFolder.uri.fsPath,
    filePath: document.uri.fsPath,
    language: document.languageId,
    symbolName,
    symbolKind: "function",
    signature: document.lineAt(selection.start.line).text.trim(),
    symbolKeyHint: [
      workspaceFolder.uri.fsPath,
      document.uri.fsPath,
      symbolName,
      selection.start.line + 1,
      selection.end.line + 1
    ].join("::"),
    range: {
      startLine: selection.start.line + 1,
      endLine: selection.end.line + 1
    },
    code,
    imports,
    callers: [],
    callees: await resolveCalleesFromText(document, code, selection.start, symbolName),
    nearbySymbols: []
  };
}

// --- Path 2: VS Code symbol provider context ---

async function buildSymbolContext(
  document: vscode.TextDocument,
  symbolPath: vscode.DocumentSymbol[]
): Promise<SymbolContext | undefined> {
  const currentSymbol = symbolPath[symbolPath.length - 1];
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return undefined;
  }

  const container = symbolPath.length > 1 ? symbolPath[symbolPath.length - 2] : undefined;
  const range = currentSymbol.range;
  const code = document.getText(range);
  const imports = extractImports(document.getText());
  const declarationPosition = currentSymbol.selectionRange.start;

  const [callers, callees] = await Promise.all([
    resolveCallers(document, currentSymbol),
    resolveCallees(document, currentSymbol)
  ]);

  const nearbySymbols = buildNearbySymbols(document.uri.fsPath, symbolPath[0], currentSymbol);

  return {
    workspaceRoot: workspaceFolder.uri.fsPath,
    filePath: document.uri.fsPath,
    language: document.languageId,
    symbolName: currentSymbol.name,
    symbolKind: mapSymbolKind(currentSymbol.kind),
    signature: document.lineAt(declarationPosition.line).text.trim(),
    containerName: container?.name,
    symbolKeyHint: [
      workspaceFolder.uri.fsPath,
      document.uri.fsPath,
      currentSymbol.name,
      range.start.line + 1,
      range.end.line + 1
    ].join("::"),
    range: {
      startLine: range.start.line + 1,
      endLine: range.end.line + 1
    },
    code,
    imports,
    callers,
    callees,
    nearbySymbols
  };
}

// --- Path 3: Text-based fallback ---

async function buildFallbackSymbolContext(
  document: vscode.TextDocument,
  activeLine: number
): Promise<SymbolContext | undefined> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return undefined;
  }

  // Try brace-delimited block detection (Java, C, TS/JS with braces)
  const methodRange = findEnclosingBlock(document, activeLine, "method");
  if (methodRange) {
    return buildFallbackFromBlock(document, workspaceFolder, methodRange, activeLine);
  }

  // Try indentation-based block detection (Python, YAML, etc.)
  const indentRange = findIndentationBlock(document, activeLine);
  if (indentRange) {
    return buildFallbackFromBlock(document, workspaceFolder, indentRange, activeLine);
  }

  // Last resort: take a reasonable chunk of surrounding code
  return buildSurroundingContext(document, workspaceFolder, activeLine);
}

async function buildFallbackFromBlock(
  document: vscode.TextDocument,
  workspaceFolder: vscode.WorkspaceFolder,
  block: { startLine: number; endLine: number; signatureLine: number },
  _activeLine: number
): Promise<SymbolContext | undefined> {
  const signatureText = document.lineAt(block.signatureLine).text.trim();
  const symbolName = extractAnyFunctionName(signatureText);
  if (!symbolName) {
    return undefined;
  }

  const codeRange = new vscode.Range(
    block.startLine, 0,
    block.endLine, document.lineAt(block.endLine).text.length
  );
  const code = document.getText(codeRange);
  const imports = extractImports(document.getText());
  const classRange = findEnclosingBlock(document, block.startLine > 0 ? block.startLine - 1 : 0, "class");

  const nearbySymbols = extractNearbyMethodNames(document, block.startLine, block.endLine)
    .filter((name) => name !== symbolName)
    .slice(0, 10)
    .map((name) => ({ name, filePath: document.uri.fsPath }));

  const callers = await resolveCallersFromText(document, symbolName, block.startLine, block.endLine);
  const callees = await resolveCalleesFromText(document, code, codeRange.start, symbolName);

  return {
    workspaceRoot: workspaceFolder.uri.fsPath,
    filePath: document.uri.fsPath,
    language: document.languageId,
    symbolName,
    symbolKind: "function",
    signature: signatureText,
    containerName: classRange
      ? extractClassName(document.lineAt(classRange.signatureLine).text.trim())
      : undefined,
    symbolKeyHint: [
      workspaceFolder.uri.fsPath,
      document.uri.fsPath,
      symbolName,
      block.startLine + 1,
      block.endLine + 1
    ].join("::"),
    range: {
      startLine: block.startLine + 1,
      endLine: block.endLine + 1
    },
    code,
    imports,
    callers,
    callees,
    nearbySymbols
  };
}

function buildSurroundingContext(
  document: vscode.TextDocument,
  workspaceFolder: vscode.WorkspaceFolder,
  activeLine: number
): SymbolContext | undefined {
  const startLine = Math.max(0, activeLine - 15);
  const endLine = Math.min(document.lineCount - 1, activeLine + 15);
  const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
  const code = document.getText(range);

  if (!code.trim()) {
    return undefined;
  }

  const lineText = document.lineAt(activeLine).text.trim();
  const symbolName = extractAnyFunctionName(lineText)
    ?? extractAnyFunctionName(code)
    ?? `code_L${activeLine + 1}`;
  const imports = extractImports(document.getText());

  return {
    workspaceRoot: workspaceFolder.uri.fsPath,
    filePath: document.uri.fsPath,
    language: document.languageId,
    symbolName,
    symbolKind: "unknown",
    signature: lineText,
    symbolKeyHint: [
      workspaceFolder.uri.fsPath,
      document.uri.fsPath,
      symbolName,
      startLine + 1,
      endLine + 1
    ].join("::"),
    range: {
      startLine: startLine + 1,
      endLine: endLine + 1
    },
    code,
    imports,
    callers: [],
    callees: [],
    nearbySymbols: []
  };
}

// --- Name extraction (handles all common patterns) ---

const FUNCTION_NAME_PATTERNS: RegExp[] = [
  // standard: function myFunc(
  /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
  // arrow/const: const myFunc = (...) =>
  /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/,
  // arrow/const with type: const myFunc: Type = (...) =>
  /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?\s*=\s*(?:async\s*)?\(/,
  // arrow/const simple: const myFunc = async () =>
  /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?[^;]*=>/,
  // method in class/object: myMethod(
  /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/,
  // export function: export function myFunc(
  /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
  // export const arrow: export const myFunc = (
  /\bexport\s+(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/,
  // Python def: def myFunc(
  /\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  // Python async def
  /\basync\s+def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  // Ruby def
  /\bdef\s+(?:self\.)?([A-Za-z_][A-Za-z0-9_?!]*)/,
  // Go func
  /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  // Java/C#/Kotlin-style: public void myMethod(
  /\b(?:public|private|protected|static|async|override|virtual|abstract)\s+(?:\S+\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
  // Simple: identifier followed by (
  /([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
];

const CONTROL_FLOW_NAMES = new Set([
  "if", "for", "while", "switch", "catch", "try", "else", "do",
  "synchronized", "return", "typeof", "new", "await", "console",
  "super", "throw", "delete", "void", "import", "export", "require",
  "print", "class", "interface", "enum", "type"
]);

function extractAnyFunctionName(text: string): string | undefined {
  for (const pattern of FUNCTION_NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] && !CONTROL_FLOW_NAMES.has(match[1])) {
      return match[1];
    }
  }
  return undefined;
}

// --- Block detection ---

function findEnclosingBlock(
  document: vscode.TextDocument,
  activeLine: number,
  type: "method" | "class"
): { startLine: number; endLine: number; signatureLine: number } | undefined {
  for (let line = activeLine; line >= 0; line -= 1) {
    const text = document.lineAt(line).text;
    if (!text.includes("{")) {
      continue;
    }

    const signatureLine = findSignatureLine(document, line);
    const signature = collectSignature(document, signatureLine, line);
    const isMatch = type === "method"
      ? looksLikeMethodSignature(signature)
      : looksLikeClassSignature(signature);

    if (!isMatch) {
      continue;
    }

    const endLine = findBlockEndLine(document, line);
    if (endLine === undefined || activeLine > endLine) {
      continue;
    }

    return { startLine: signatureLine, endLine, signatureLine };
  }

  return undefined;
}

function findIndentationBlock(
  document: vscode.TextDocument,
  activeLine: number
): { startLine: number; endLine: number; signatureLine: number } | undefined {
  for (let line = activeLine; line >= 0; line -= 1) {
    const text = document.lineAt(line).text;
    const trimmed = text.trim();

    // Python-style: def/class/async def
    if (/^(?:async\s+)?def\s+\w+|^class\s+\w+/.test(trimmed)) {
      const bodyIndent = getIndentation(text) + 1;
      let endLine = line;

      for (let j = line + 1; j < document.lineCount; j++) {
        const jText = document.lineAt(j).text;
        if (!jText.trim()) {
          continue;
        }
        if (getIndentation(jText) >= bodyIndent) {
          endLine = j;
        } else {
          break;
        }
      }

      if (activeLine <= endLine) {
        return { startLine: line, endLine, signatureLine: line };
      }
    }
  }

  return undefined;
}

function getIndentation(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) { return 0; }
  const spaces = match[1];
  let count = 0;
  for (const ch of spaces) {
    count += ch === "\t" ? 4 : 1;
  }
  return Math.floor(count / 2);
}

function looksLikeMethodSignature(signature: string): boolean {
  if (!signature.includes("{")) {
    return false;
  }

  if (/\b(if|for|while|switch|catch|try|else|do|synchronized)\b/.test(signature)) {
    return false;
  }

  // Standard function: name(...)
  if (/([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.test(signature) && signature.includes(")")) {
    return true;
  }

  // Arrow function: const name = ... => {
  if (/\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*(?::[^=]+)?\s*=/.test(signature) && signature.includes("=>")) {
    return true;
  }

  // Arrow without parens: const name = arg => {
  if (/\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(?:async\s+)?[A-Za-z_$][A-Za-z0-9_$]*\s*=>/.test(signature)) {
    return true;
  }

  return false;
}

function looksLikeClassSignature(signature: string): boolean {
  return /\b(class|interface|enum|record)\s+[A-Za-z_][A-Za-z0-9_]*/.test(signature) && signature.includes("{");
}

function findSignatureLine(document: vscode.TextDocument, braceLine: number): number {
  let line = braceLine;
  while (line > 0) {
    const previous = document.lineAt(line - 1).text.trim();
    if (!previous) {
      break;
    }
    if (previous.endsWith(";") || previous.endsWith("}")) {
      break;
    }
    if (previous.startsWith("@") || previous.startsWith("//") || previous.startsWith("/*") || previous.startsWith("*")) {
      break;
    }

    const keywords = [
      "function ", "const ", "let ", "var ", "export ", "async ",
      "public ", "private ", "protected ", "class ", "def ", "func ",
      "static ", "override ", "abstract "
    ];
    if (keywords.some((kw) => previous.includes(kw)) || previous.includes("(") || previous.includes("=>")) {
      line -= 1;
      continue;
    }
    break;
  }
  return line;
}

function collectSignature(document: vscode.TextDocument, startLine: number, endLine: number): string {
  const lines: string[] = [];
  for (let line = startLine; line <= endLine; line += 1) {
    lines.push(document.lineAt(line).text.trim());
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function findBlockEndLine(document: vscode.TextDocument, startLine: number): number | undefined {
  let depth = 0;
  let opened = false;

  for (let line = startLine; line < document.lineCount; line += 1) {
    const text = document.lineAt(line).text;
    for (const char of text) {
      if (char === "{") {
        depth += 1;
        opened = true;
      } else if (char === "}") {
        depth -= 1;
        if (opened && depth === 0) {
          return line;
        }
      }
    }
  }

  return undefined;
}

function extractClassName(signature: string): string | undefined {
  const match = signature.match(/\b(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1];
}

function extractNearbyMethodNames(
  document: vscode.TextDocument,
  currentStartLine: number,
  currentEndLine: number
): string[] {
  const names = new Set<string>();

  for (let line = 0; line < document.lineCount; line += 1) {
    if (line >= currentStartLine && line <= currentEndLine) {
      continue;
    }
    const text = document.lineAt(line).text.trim();
    const name = extractAnyFunctionName(text);
    if (name && !CONTROL_FLOW_NAMES.has(name)) {
      names.add(name);
    }
  }

  return [...names];
}

// --- Caller/callee resolution ---

async function resolveCallersFromText(
  document: vscode.TextDocument,
  symbolName: string,
  currentStartLine: number,
  currentEndLine: number
): Promise<RelatedSymbol[]> {
  const related = new Map<string, RelatedSymbol>();
  const fullText = document.getText();
  const matcher = new RegExp(`\\b${escapeRegExp(symbolName)}\\s*\\(`, "g");

  for (const match of fullText.matchAll(matcher)) {
    const offset = match.index ?? 0;
    const position = document.positionAt(offset);
    if (position.line >= currentStartLine && position.line <= currentEndLine) {
      continue;
    }

    const callerBlock = findEnclosingBlock(document, position.line, "method");
    if (!callerBlock) {
      continue;
    }
    const signature = document.lineAt(callerBlock.signatureLine).text.trim();
    const callerName = extractAnyFunctionName(signature);
    if (!callerName || callerName === symbolName) {
      continue;
    }
    const key = `${callerName}:${document.uri.fsPath}:${signature}`;
    related.set(key, {
      name: callerName,
      filePath: document.uri.fsPath,
      signature
    });
  }

  return [...related.values()].slice(0, MAX_RELATED);
}

async function resolveCalleesFromText(
  document: vscode.TextDocument,
  code: string,
  startPosition: vscode.Position,
  symbolName: string
): Promise<RelatedSymbol[]> {
  const resolved = new Map<string, RelatedSymbol>();
  const fallbackNames = new Set<string>();
  const baseOffset = document.offsetAt(startPosition);

  for (const match of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = match[1];
    if (KEYWORDS.has(name) || name === symbolName) {
      continue;
    }

    fallbackNames.add(name);
    const absoluteOffset = baseOffset + (match.index ?? 0);
    const position = document.positionAt(absoluteOffset);

    try {
      const definitions =
        (await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
          "vscode.executeDefinitionProvider",
          document.uri,
          position
        )) ?? [];

      for (const definition of definitions) {
        const { uri, range } = getDefinitionTarget(definition);
        if (!isWorkspaceFile(uri)) {
          continue;
        }
        const targetDocument = await vscode.workspace.openTextDocument(uri);
        const signature = targetDocument.lineAt(range.start.line).text.trim();
        const key = `${name}:${uri.fsPath}:${signature}`;
        if (!resolved.has(key)) {
          resolved.set(key, { name, filePath: uri.fsPath, signature });
        }
      }
    } catch {
      // fall through to heuristic capture
    }
  }

  for (const name of fallbackNames) {
    const key = `${name}:${document.uri.fsPath}`;
    if (!resolved.has(key)) {
      resolved.set(key, { name, filePath: document.uri.fsPath });
    }
  }

  return [...resolved.values()].slice(0, MAX_RELATED);
}

async function resolveCallees(
  document: vscode.TextDocument,
  symbol: vscode.DocumentSymbol
): Promise<RelatedSymbol[]> {
  const code = document.getText(symbol.range);
  const baseOffset = document.offsetAt(symbol.range.start);
  const fallbackNames = new Set<string>();
  const resolved = new Map<string, RelatedSymbol>();

  for (const match of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = match[1];
    if (KEYWORDS.has(name) || name === symbol.name) {
      continue;
    }

    fallbackNames.add(name);
    const absoluteOffset = baseOffset + (match.index ?? 0);
    const position = document.positionAt(absoluteOffset);

    try {
      const definitions =
        (await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
          "vscode.executeDefinitionProvider",
          document.uri,
          position
        )) ?? [];

      for (const definition of definitions) {
        const { uri, range } = getDefinitionTarget(definition);
        if (!isWorkspaceFile(uri)) {
          continue;
        }
        const targetDocument = await vscode.workspace.openTextDocument(uri);
        const signature = targetDocument.lineAt(range.start.line).text.trim();
        const key = `${name}:${uri.fsPath}:${signature}`;
        if (!resolved.has(key)) {
          resolved.set(key, {
            name,
            filePath: uri.fsPath,
            signature,
            snippet: targetDocument.getText(
              new vscode.Range(range.start.line, 0, Math.min(range.start.line + 3, targetDocument.lineCount - 1), 0)
            )
          });
        }
      }
    } catch {
      // fall through to heuristic capture
    }
  }

  const related = [...resolved.values()];
  if (related.length >= MAX_RELATED) {
    return related.slice(0, MAX_RELATED);
  }

  for (const name of fallbackNames) {
    const key = `${name}:${document.uri.fsPath}`;
    if (!resolved.has(key)) {
      resolved.set(key, { name, filePath: document.uri.fsPath });
    }
  }

  return [...resolved.values()].slice(0, MAX_RELATED);
}

async function resolveCallers(
  document: vscode.TextDocument,
  symbol: vscode.DocumentSymbol
): Promise<RelatedSymbol[]> {
  const related = new Map<string, RelatedSymbol>();

  try {
    const references =
      (await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeReferenceProvider",
        document.uri,
        symbol.selectionRange.start
      )) ?? [];

    for (const reference of references) {
      if (isInside(symbol.selectionRange, reference.range) && reference.uri.fsPath === document.uri.fsPath) {
        continue;
      }

      if (!isWorkspaceFile(reference.uri)) {
        continue;
      }

      const referenceDocument = await vscode.workspace.openTextDocument(reference.uri);
      const referenceSymbols = await getDocumentSymbols(reference.uri);
      const symbolPath = findInnermostSymbolPath(referenceSymbols, reference.range.start.line);
      const caller = symbolPath[symbolPath.length - 1];
      if (!caller || caller.name === symbol.name) {
        continue;
      }

      const signature = referenceDocument.lineAt(caller.selectionRange.start.line).text.trim();
      const key = `${caller.name}:${reference.uri.fsPath}:${signature}`;
      if (!related.has(key)) {
        related.set(key, {
          name: caller.name,
          filePath: reference.uri.fsPath,
          signature
        });
      }
    }
  } catch {
    // best-effort only
  }

  return [...related.values()].slice(0, MAX_RELATED);
}

// --- Utility functions ---

async function getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
  return (
    (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      uri
    )) ?? []
  );
}

function findInnermostSymbolPath(
  symbols: vscode.DocumentSymbol[],
  line: number,
  pathToHere: vscode.DocumentSymbol[] = []
): vscode.DocumentSymbol[] {
  for (const symbol of symbols) {
    if (symbol.range.start.line <= line && symbol.range.end.line >= line) {
      const currentPath = [...pathToHere, symbol];
      const child = findInnermostSymbolPath(symbol.children, line, currentPath);
      return child.length ? child : currentPath;
    }
  }
  return [];
}

function findPathByRange(
  symbols: vscode.DocumentSymbol[],
  range: vscode.Range,
  pathToHere: vscode.DocumentSymbol[]
): vscode.DocumentSymbol[] {
  for (const symbol of symbols) {
    if (symbol.range.isEqual(range)) {
      return [...pathToHere, symbol];
    }
    const child = findPathByRange(symbol.children, range, [...pathToHere, symbol]);
    if (child.length) {
      return child;
    }
  }
  return [];
}

function flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  return symbols.flatMap((symbol) => [symbol, ...flattenSymbols(symbol.children)]);
}

function buildNearbySymbols(
  filePath: string,
  root: vscode.DocumentSymbol,
  current: vscode.DocumentSymbol
): RelatedSymbol[] {
  return flattenSymbols([root])
    .filter((symbol) => symbol.name !== current.name)
    .slice(0, 10)
    .map((symbol) => ({ name: symbol.name, filePath }));
}

function isInside(outer: vscode.Range, inner: vscode.Range): boolean {
  return outer.contains(inner.start) && outer.contains(inner.end);
}

function isWorkspaceFile(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && Boolean(vscode.workspace.getWorkspaceFolder(uri));
}

function getDefinitionTarget(
  definition: vscode.Location | vscode.LocationLink
): { uri: vscode.Uri; range: vscode.Range } {
  if ("targetUri" in definition) {
    return {
      uri: definition.targetUri,
      range: definition.targetSelectionRange ?? definition.targetRange
    };
  }
  return { uri: definition.uri, range: definition.range };
}

function mapSymbolKind(kind: vscode.SymbolKind): SymbolKind {
  switch (kind) {
    case vscode.SymbolKind.Function:
      return "function";
    case vscode.SymbolKind.Method:
      return "method";
    case vscode.SymbolKind.Class:
      return "class";
    default:
      return "unknown";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractImports(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(import|export .* from|const .* require\(|from\s+\w+)/.test(line))
    .slice(0, MAX_IMPORTS);
}

export function buildRelatedSymbolSummary(symbol: RelatedSymbol): string {
  return `${symbol.name} (${path.basename(symbol.filePath)})`;
}
