import { ChangedRegion, DiffAnalysis, IncrementalConfig } from "../core/types";

/**
 * Computes a line-level diff between old and new code and produces a
 * unified-diff string along with structural metrics (region count, change ratio)
 * that the orchestrator uses to decide whether the incremental explain path
 * is worthwhile.
 *
 * Uses a simple LCS-based algorithm — no external dependencies.
 */
export function analyzeDiff(oldCode: string, newCode: string, contextLines = 5): DiffAnalysis {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");

  const lcs = computeLCS(oldLines, newLines);
  const edits = buildEditScript(oldLines, newLines, lcs);
  const regions = extractRegions(edits);
  const hunks = mergeHunksWithContext(edits, oldLines, newLines, contextLines);

  let addedLines = 0;
  let removedLines = 0;
  for (const edit of edits) {
    if (edit.type === "add") { addedLines++; }
    if (edit.type === "remove") { removedLines++; }
  }

  const changedLines = addedLines + removedLines;
  const totalLines = Math.max(oldLines.length, newLines.length);
  const changeRatio = totalLines > 0 ? changedLines / totalLines : 0;

  return {
    totalLines,
    changedLines,
    addedLines,
    removedLines,
    changeRatio,
    regionCount: regions.length,
    regions,
    unifiedDiff: hunks
  };
}

export function isIncrementalCandidate(analysis: DiffAnalysis, config: IncrementalConfig): boolean {
  if (!config.enabled) {
    return false;
  }
  if (analysis.totalLines < config.minFunctionLines) {
    return false;
  }
  if (analysis.changedLines === 0) {
    return false;
  }

  const scaleFactor = Math.min(analysis.totalLines / 100, 2.0);
  const effectiveMaxChangeRatio = config.maxChangeRatio * scaleFactor;
  const effectiveMaxRegions = Math.floor(config.maxChangedRegions * scaleFactor);

  if (analysis.changeRatio > effectiveMaxChangeRatio) {
    return false;
  }
  if (analysis.changedLines > config.maxChangedLines) {
    return false;
  }
  if (analysis.regionCount > effectiveMaxRegions) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// LCS + Edit Script
// ---------------------------------------------------------------------------

interface Edit {
  type: "keep" | "add" | "remove";
  oldIndex: number;
  newIndex: number;
  line: string;
}

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function buildEditScript(oldLines: string[], newLines: string[], dp: number[][]): Edit[] {
  const edits: Edit[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.push({ type: "keep", oldIndex: i - 1, newIndex: j - 1, line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.push({ type: "add", oldIndex: i - 1, newIndex: j - 1, line: newLines[j - 1] });
      j--;
    } else {
      edits.push({ type: "remove", oldIndex: i - 1, newIndex: -1, line: oldLines[i - 1] });
      i--;
    }
  }

  return edits.reverse();
}

function extractRegions(edits: Edit[]): ChangedRegion[] {
  const regions: ChangedRegion[] = [];
  let inRegion = false;
  let regionOldStart = 0;
  let regionNewStart = 0;
  let regionRemoved = 0;
  let regionAdded = 0;

  for (const edit of edits) {
    if (edit.type === "keep") {
      if (inRegion) {
        regions.push({
          oldStartLine: regionOldStart,
          newStartLine: regionNewStart,
          linesRemoved: regionRemoved,
          linesAdded: regionAdded
        });
        inRegion = false;
      }
    } else {
      if (!inRegion) {
        inRegion = true;
        regionOldStart = edit.type === "remove" ? edit.oldIndex + 1 : edit.oldIndex + 1;
        regionNewStart = edit.type === "add" ? edit.newIndex + 1 : edit.newIndex + 1;
        regionRemoved = 0;
        regionAdded = 0;
      }
      if (edit.type === "remove") { regionRemoved++; }
      if (edit.type === "add") { regionAdded++; }
    }
  }

  if (inRegion) {
    regions.push({
      oldStartLine: regionOldStart,
      newStartLine: regionNewStart,
      linesRemoved: regionRemoved,
      linesAdded: regionAdded
    });
  }

  return regions;
}

// ---------------------------------------------------------------------------
// Unified diff generation
// ---------------------------------------------------------------------------

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

function mergeHunksWithContext(
  edits: Edit[],
  oldLines: string[],
  newLines: string[],
  contextLines: number
): string {
  const rawHunks = buildRawHunks(edits, contextLines, oldLines.length, newLines.length);

  const merged: Hunk[] = [];
  for (const hunk of rawHunks) {
    const prev = merged[merged.length - 1];
    if (prev && hunk.oldStart <= prev.oldStart + prev.oldCount) {
      prev.oldCount = hunk.oldStart + hunk.oldCount - prev.oldStart;
      prev.newCount = hunk.newStart + hunk.newCount - prev.newStart;
      prev.lines.push(...hunk.lines);
    } else {
      merged.push({ ...hunk, lines: [...hunk.lines] });
    }
  }

  const parts: string[] = [];
  for (const hunk of merged) {
    parts.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
    parts.push(...hunk.lines);
  }

  return parts.join("\n");
}

function buildRawHunks(
  edits: Edit[],
  contextLines: number,
  _oldLength: number,
  _newLength: number
): Hunk[] {
  const hunks: Hunk[] = [];

  const changeIndices: number[] = [];
  for (let idx = 0; idx < edits.length; idx++) {
    if (edits[idx].type !== "keep") {
      changeIndices.push(idx);
    }
  }

  if (changeIndices.length === 0) {
    return [];
  }

  const groups: number[][] = [];
  let currentGroup: number[] = [changeIndices[0]];
  for (let k = 1; k < changeIndices.length; k++) {
    if (changeIndices[k] - changeIndices[k - 1] <= contextLines * 2 + 1) {
      currentGroup.push(changeIndices[k]);
    } else {
      groups.push(currentGroup);
      currentGroup = [changeIndices[k]];
    }
  }
  groups.push(currentGroup);

  for (const group of groups) {
    const firstChange = group[0];
    const lastChange = group[group.length - 1];
    const start = Math.max(0, firstChange - contextLines);
    const end = Math.min(edits.length - 1, lastChange + contextLines);

    const lines: string[] = [];
    let oldStart = 0;
    let newStart = 0;
    let oldCount = 0;
    let newCount = 0;
    let firstOldLine = true;
    let firstNewLine = true;

    for (let idx = start; idx <= end; idx++) {
      const edit = edits[idx];
      if (edit.type === "keep") {
        lines.push(` ${edit.line}`);
        if (firstOldLine) { oldStart = edit.oldIndex + 1; firstOldLine = false; }
        if (firstNewLine) { newStart = edit.newIndex + 1; firstNewLine = false; }
        oldCount++;
        newCount++;
      } else if (edit.type === "remove") {
        lines.push(`-${edit.line}`);
        if (firstOldLine) { oldStart = edit.oldIndex + 1; firstOldLine = false; }
        if (firstNewLine) { newStart = edit.oldIndex + 1; firstNewLine = false; }
        oldCount++;
      } else {
        lines.push(`+${edit.line}`);
        if (firstNewLine) { newStart = edit.newIndex + 1; firstNewLine = false; }
        if (firstOldLine) { oldStart = edit.newIndex + 1; firstOldLine = false; }
        newCount++;
      }
    }

    hunks.push({ oldStart, oldCount, newStart, newCount, lines });
  }

  return hunks;
}
