import * as path from "path";
import * as vscode from "vscode";

export interface CodeReferenceOccurrence {
  filePath: string;
  range: {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
  };
}

export interface CodeReferenceMapEntry {
  identifier: string;
  occurrences: CodeReferenceOccurrence[];
}

interface OccurrenceChoice {
  occurrence: CodeReferenceOccurrence;
  score: number;
}

interface DocumentIndexCacheEntry {
  version: number;
  index: Map<string, vscode.Range[]>;
  lineTexts: string[];
}

export async function buildCodeReferenceMapForDocument(
  markdown: string,
  document: vscode.TextDocument,
  options: {
    focusedRange?: vscode.Range;
    seedIdentifiers?: string[];
  } = {}
): Promise<CodeReferenceMapEntry[]> {
  const identifiers = collectMentionedIdentifiers(markdown, options.seedIdentifiers ?? []);
  if (identifiers.length === 0) {
    return [];
  }

  const symbolRanges = await collectDocumentSymbolRanges(document);
  const lines = document.getText().split(/\r?\n/);
  const result: CodeReferenceMapEntry[] = [];

  for (const identifier of identifiers) {
    const occurrences: CodeReferenceOccurrence[] = [];
    const seen = new Set<string>();
    const declarationRanges = symbolRanges.get(identifier) ?? [];

    for (const range of declarationRanges) {
      pushOccurrence(occurrences, seen, document.uri.fsPath, range);
    }

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      const line = lines[lineIdx];
      const matches = findIdentifierMatchesInLine(line, identifier);
      for (const match of matches) {
        const range = new vscode.Range(
          new vscode.Position(lineIdx, match.start),
          new vscode.Position(lineIdx, match.end)
        );
        pushOccurrence(occurrences, seen, document.uri.fsPath, range);
      }
    }

    if (occurrences.length > 0) {
      result.push({
        identifier,
        occurrences: sortOccurrencesByFocus(occurrences, options.focusedRange)
      });
    }
  }

  return result;
}

export class CodeReferenceNavigator {
  private readonly documentIndexCache = new Map<string, DocumentIndexCacheEntry>();
  private readonly highlightDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.wordHighlightStrongBackground"),
    borderRadius: "3px"
  });
  private clearHighlightTimer: NodeJS.Timeout | undefined;
  private clickDebounceTimer: NodeJS.Timeout | undefined;

  public dispose(): void {
    if (this.clearHighlightTimer) {
      clearTimeout(this.clearHighlightTimer);
    }
    if (this.clickDebounceTimer) {
      clearTimeout(this.clickDebounceTimer);
    }
    this.highlightDecoration.dispose();
  }

  public scheduleHighlight(
    identifier: string,
    mappedOccurrences: CodeReferenceOccurrence[] = [],
    lineHint?: number
  ): void {
    if (this.clickDebounceTimer) {
      clearTimeout(this.clickDebounceTimer);
    }
    this.clickDebounceTimer = setTimeout(() => {
      void this.highlight(identifier, mappedOccurrences, lineHint);
    }, 90);
  }

  private async highlight(
    rawIdentifier: string,
    mappedOccurrences: CodeReferenceOccurrence[],
    lineHint?: number
  ): Promise<void> {
    const identifier = normalizeIdentifier(rawIdentifier);
    if (!identifier) {
      void vscode.window.showWarningMessage("KYC: Invalid code reference.");
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const activeFilePath = activeEditor?.document.uri.fsPath;
    const mappedCandidates = mappedOccurrences.length
      ? this.scoreOccurrences(mappedOccurrences, activeFilePath)
      : [];

    let chosen = await this.pickBestOccurrence(mappedCandidates, lineHint);
    if (!chosen) {
      chosen = await this.findOccurrenceFallback(identifier, activeEditor);
    }
    if (!chosen) {
      void vscode.window.showInformationMessage(`KYC: Could not locate \`${identifier}\` in the active context.`);
      return;
    }

    await this.focusOccurrence(chosen, identifier);
  }

  private scoreOccurrences(
    occurrences: CodeReferenceOccurrence[],
    activeFilePath: string | undefined
  ): OccurrenceChoice[] {
    return occurrences.map((occurrence) => {
      let score = 0;
      if (activeFilePath && occurrence.filePath === activeFilePath) {
        score += 100;
      }
      score += 1 / Math.max(1, occurrence.range.startLine + 1);
      return { occurrence, score };
    }).sort((a, b) => b.score - a.score);
  }

  private async pickBestOccurrence(
    choices: OccurrenceChoice[],
    lineHint?: number
  ): Promise<CodeReferenceOccurrence | undefined> {
    if (choices.length === 0) {
      return undefined;
    }
    if (choices.length === 1) {
      return choices[0].occurrence;
    }
    if (typeof lineHint === "number" && Number.isFinite(lineHint) && lineHint > 0) {
      const closest = [...choices].sort((a, b) => {
        const aDistance = Math.abs(a.occurrence.range.startLine - lineHint);
        const bDistance = Math.abs(b.occurrence.range.startLine - lineHint);
        if (aDistance !== bDistance) {
          return aDistance - bDistance;
        }
        return b.score - a.score;
      })[0];
      return closest?.occurrence;
    }

    const topChoices = choices.slice(0, 12);
    const quickPickItems = await Promise.all(topChoices.map(async (choice) => {
      const doc = await vscode.workspace.openTextDocument(choice.occurrence.filePath);
      const line = clamp(choice.occurrence.range.startLine - 1, 0, doc.lineCount - 1);
      const preview = doc.lineAt(line).text.trim();
      return {
        label: `${path.basename(choice.occurrence.filePath)}:${choice.occurrence.range.startLine}`,
        description: preview.slice(0, 90),
        occurrence: choice.occurrence
      };
    }));

    const picked = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: "KYC: Multiple matches found. Select occurrence to highlight."
    });
    return picked?.occurrence ?? topChoices[0].occurrence;
  }

  private async findOccurrenceFallback(
    identifier: string,
    activeEditor: vscode.TextEditor | undefined
  ): Promise<CodeReferenceOccurrence | undefined> {
    if (!activeEditor) {
      return undefined;
    }

    const ranges = this.findIdentifierRangesInDocument(activeEditor.document, identifier);
    if (ranges.length === 0) {
      return undefined;
    }
    const first = ranges[0];
    return {
      filePath: activeEditor.document.uri.fsPath,
      range: toSerializableRange(first)
    };
  }

  private findIdentifierRangesInDocument(
    document: vscode.TextDocument,
    identifier: string
  ): vscode.Range[] {
    const key = document.uri.toString();
    const cached = this.documentIndexCache.get(key);
    if (!cached || cached.version !== document.version) {
      const rebuilt = this.buildDocumentIndex(document);
      this.documentIndexCache.set(key, rebuilt);
      return rebuilt.index.get(identifier) ?? [];
    }
    return cached.index.get(identifier) ?? [];
  }

  private buildDocumentIndex(document: vscode.TextDocument): DocumentIndexCacheEntry {
    const lines = document.getText().split(/\r?\n/);
    const index = new Map<string, vscode.Range[]>();
    const tokenRegex = /\b[A-Za-z_$][\w$]*\b/g;

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
      const line = lines[lineNumber];
      tokenRegex.lastIndex = 0;
      let match = tokenRegex.exec(line);
      while (match) {
        const identifier = match[0];
        const start = match.index;
        const end = start + identifier.length;
        const ranges = index.get(identifier) ?? [];
        ranges.push(
          new vscode.Range(
            new vscode.Position(lineNumber, start),
            new vscode.Position(lineNumber, end)
          )
        );
        index.set(identifier, ranges);
        match = tokenRegex.exec(line);
      }
    }

    return {
      version: document.version,
      index,
      lineTexts: lines
    };
  }

  private async focusOccurrence(occurrence: CodeReferenceOccurrence, identifier: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(occurrence.filePath);
    const existingEditor = vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === doc.uri.toString()
    );
    const preferredEditor = existingEditor ?? vscode.window.activeTextEditor;
    const editor = await vscode.window.showTextDocument(doc, {
      preview: false,
      preserveFocus: false,
      viewColumn: preferredEditor?.viewColumn
    });
    const range = fromSerializableRange(occurrence.range);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    this.applyTemporaryHighlight(editor, range);
    void vscode.window.setStatusBarMessage(`KYC: Focused ${identifier}`, 2000);
  }

  private applyTemporaryHighlight(editor: vscode.TextEditor, range: vscode.Range): void {
    editor.setDecorations(this.highlightDecoration, [range]);
    if (this.clearHighlightTimer) {
      clearTimeout(this.clearHighlightTimer);
    }
    this.clearHighlightTimer = setTimeout(() => {
      editor.setDecorations(this.highlightDecoration, []);
      this.clearHighlightTimer = undefined;
    }, 2500);
  }
}

function collectMentionedIdentifiers(markdown: string, seedIdentifiers: string[]): string[] {
  const identifiers = new Set<string>();
  for (const seed of seedIdentifiers) {
    const normalized = normalizeIdentifier(seed);
    if (normalized) {
      identifiers.add(normalized);
    }
  }

  const inlineCodeRegex = /`([^`\n]+)`/g;
  let inlineMatch = inlineCodeRegex.exec(markdown);
  while (inlineMatch) {
    const fromInline = extractIdentifierFromToken(inlineMatch[1]);
    if (fromInline) {
      identifiers.add(fromInline);
    }
    inlineMatch = inlineCodeRegex.exec(markdown);
  }

  const callLikeRegex = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let callMatch = callLikeRegex.exec(markdown);
  while (callMatch) {
    const fromCall = normalizeIdentifier(callMatch[1]);
    if (fromCall) {
      identifiers.add(fromCall);
    }
    callMatch = callLikeRegex.exec(markdown);
  }

  const bareIdentifierRegex = /\b([A-Za-z_$][\w$]*)\b/g;
  let bareMatch = bareIdentifierRegex.exec(markdown);
  while (bareMatch) {
    const candidate = bareMatch[1];
    if (looksLikeCodeIdentifier(candidate)) {
      const normalized = normalizeIdentifier(candidate);
      if (normalized) {
        identifiers.add(normalized);
      }
    }
    bareMatch = bareIdentifierRegex.exec(markdown);
  }

  return Array.from(identifiers);
}

async function collectDocumentSymbolRanges(
  document: vscode.TextDocument
): Promise<Map<string, vscode.Range[]>> {
  const map = new Map<string, vscode.Range[]>();
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );
    if (!symbols || symbols.length === 0) {
      return map;
    }

    const visit = (symbol: vscode.DocumentSymbol): void => {
      const identifier = normalizeIdentifier(symbol.name);
      if (identifier) {
        const ranges = map.get(identifier) ?? [];
        ranges.push(symbol.selectionRange);
        map.set(identifier, ranges);
      }
      for (const child of symbol.children) {
        visit(child);
      }
    };

    for (const symbol of symbols) {
      visit(symbol);
    }
  } catch {
    // no-op: if symbol provider is unavailable for the language, fallback matching still works.
  }
  return map;
}

function findIdentifierMatchesInLine(line: string, identifier: string): Array<{ start: number; end: number }> {
  const matches: Array<{ start: number; end: number }> = [];
  const escaped = escapeRegExp(identifier);
  const regex = new RegExp(`\\b${escaped}\\b`, "g");
  let match = regex.exec(line);
  while (match) {
    matches.push({ start: match.index, end: match.index + identifier.length });
    match = regex.exec(line);
  }
  return matches;
}

function sortOccurrencesByFocus(
  occurrences: CodeReferenceOccurrence[],
  focusedRange: vscode.Range | undefined
): CodeReferenceOccurrence[] {
  if (!focusedRange) {
    return occurrences;
  }
  const focusedLine = focusedRange.start.line + 1;
  return [...occurrences].sort((a, b) => {
    const distanceA = Math.abs(a.range.startLine - focusedLine);
    const distanceB = Math.abs(b.range.startLine - focusedLine);
    return distanceA - distanceB;
  });
}

function pushOccurrence(
  occurrences: CodeReferenceOccurrence[],
  seen: Set<string>,
  filePath: string,
  range: vscode.Range
): void {
  const serialized = toSerializableRange(range);
  const dedupeKey = `${filePath}:${serialized.startLine}:${serialized.startChar}:${serialized.endLine}:${serialized.endChar}`;
  if (seen.has(dedupeKey)) {
    return;
  }
  seen.add(dedupeKey);
  occurrences.push({ filePath, range: serialized });
}

function extractIdentifierFromToken(token: string): string | undefined {
  const normalizedToken = token.trim();
  const functionCallMatch = normalizedToken.match(/([A-Za-z_$][\w$]*)\s*\(\s*\)$/);
  if (functionCallMatch) {
    return normalizeIdentifier(functionCallMatch[1]);
  }
  if (normalizedToken.includes(".")) {
    const parts = normalizedToken.split(".");
    return normalizeIdentifier(parts[parts.length - 1] ?? "");
  }
  return normalizeIdentifier(normalizedToken);
}

function normalizeIdentifier(value: string): string | undefined {
  const cleaned = value
    .trim()
    .replace(/^[^A-Za-z_$]+/, "")
    .replace(/[^A-Za-z0-9_$]+$/g, "")
    .replace(/\(\)$/, "");
  if (!cleaned || !/^[A-Za-z_$][\w$]*$/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function toSerializableRange(range: vscode.Range): CodeReferenceOccurrence["range"] {
  return {
    startLine: range.start.line + 1,
    startChar: range.start.character,
    endLine: range.end.line + 1,
    endChar: range.end.character
  };
}

function fromSerializableRange(range: CodeReferenceOccurrence["range"]): vscode.Range {
  return new vscode.Range(
    new vscode.Position(Math.max(0, range.startLine - 1), Math.max(0, range.startChar)),
    new vscode.Position(Math.max(0, range.endLine - 1), Math.max(0, range.endChar))
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function looksLikeCodeIdentifier(identifier: string): boolean {
  if (identifier.length < 3) {
    return false;
  }
  // Prefer tokens that resemble symbols rather than prose.
  return /[A-Z_$]/.test(identifier.slice(1)) || /_/.test(identifier);
}
