import { parseKYCResponse, sanitizeForDisplay } from "./responseParser";
import type {
  TutorialDiagram,
  TutorialDiagramStep,
  TutorialScene,
  TutorialSceneVisual,
  TutorialScript
} from "./types";

export interface ParseTutorialScriptOptions {
  modelName?: string;
  /** When set, scene highlight lines are clamped to this inclusive range (file line numbers). */
  lineRange?: { startLine: number; endLine: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampLine(line: number, start: number, end: number): number {
  return Math.min(Math.max(Math.round(line), start), end);
}

export function clampHighlightLines(
  lines: number[] | undefined,
  lineRange: { startLine: number; endLine: number } | undefined
): number[] {
  if (!lineRange || !lines?.length) {
    return normalizeNumberArray(lines);
  }
  const { startLine, endLine } = lineRange;
  const lo = Math.min(startLine, endLine);
  const hi = Math.max(startLine, endLine);
  const out = new Set<number>();
  for (const l of lines) {
    if (!Number.isFinite(l)) {
      continue;
    }
    out.add(clampLine(l, lo, hi));
  }
  return Array.from(out).sort((a, b) => a - b);
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: number[] = [];
  for (const item of value) {
    const n = typeof item === "number" ? item : Number(item);
    if (Number.isFinite(n)) {
      out.push(Math.round(n));
    }
  }
  return out;
}

function normalizeStringArray(value: unknown, maxItems = 24): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeVisual(value: unknown): TutorialSceneVisual | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const t = String(value.type ?? "").toLowerCase();
  if (t === "code" || t === "diagram") {
    return { type: t };
  }
  return undefined;
}

function normalizeDiagram(value: unknown): TutorialDiagram | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const rawType = String(value.type ?? "sequence").toLowerCase();
  const type: TutorialDiagram["type"] = rawType === "flow" ? "flow" : "sequence";
  const rawSteps = Array.isArray(value.steps) ? value.steps : [];
  const steps: TutorialDiagramStep[] = [];
  for (const step of rawSteps) {
    if (!isRecord(step)) {
      continue;
    }
    const from = String(step.from ?? step.source ?? "").trim();
    const to = String(step.to ?? step.target ?? "").trim();
    if (!from || !to) {
      continue;
    }
    steps.push({
      from,
      to,
      label: step.label !== undefined ? String(step.label).trim() : undefined
    });
  }
  if (steps.length === 0) {
    return undefined;
  }
  return { type, steps };
}

function normalizeScene(
  raw: unknown,
  index: number,
  lineRange?: { startLine: number; endLine: number }
): TutorialScene | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const title = String(raw.title ?? raw.name ?? `Scene ${index + 1}`).trim() || `Scene ${index + 1}`;
  const narration = String(raw.narration ?? raw.script ?? raw.text ?? raw.body ?? "").trim();
  if (!narration) {
    return undefined;
  }
  const idRaw = String(raw.id ?? raw.slug ?? "").trim();
  const id = idRaw || `scene-${index + 1}`;
  const highlightLines = clampHighlightLines(normalizeNumberArray(raw.highlightLines), lineRange);
  const highlightIdentifiers = normalizeStringArray(raw.highlightIdentifiers ?? raw.identifiers);
  const takeaway = raw.takeaway !== undefined ? String(raw.takeaway).trim() : undefined;
  return {
    id,
    title,
    narration,
    highlightLines,
    highlightIdentifiers,
    visual: normalizeVisual(raw.visual),
    takeaway: takeaway || undefined
  };
}

function normalizeScenes(
  value: unknown,
  lineRange?: { startLine: number; endLine: number }
): TutorialScene[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const scenes: TutorialScene[] = [];
  let i = 0;
  for (const item of value) {
    const scene = normalizeScene(item, i, lineRange);
    if (scene) {
      scenes.push(scene);
      i += 1;
    }
  }
  return scenes;
}

function buildFallbackTutorial(rawText: string, lineRange?: { startLine: number; endLine: number }): TutorialScript {
  const cleaned = sanitizeForDisplay(String(rawText ?? "").trim()) || "The model did not return valid tutorial JSON.";
  const title = cleaned.split(/\r?\n/, 1)[0]?.slice(0, 120) || "Code tutorial";
  const sceneLines = lineRange ? clampHighlightLines([lineRange.startLine, lineRange.endLine], lineRange) : [];
  return {
    title,
    audience: "developer",
    summary: cleaned.slice(0, 500),
    scenes: [
      {
        id: "scene-1",
        title: "Overview",
        narration: cleaned.slice(0, 4000),
        highlightLines: sceneLines,
        highlightIdentifiers: []
      }
    ],
    diagram: undefined,
    keyTakeaways: []
  };
}

/**
 * Parse raw model output into a normalized TutorialScript.
 */
export function parseTutorialScript(raw: string, options: ParseTutorialScriptOptions = {}): TutorialScript {
  const lineRange =
    options.lineRange !== undefined
      ? {
          startLine: Math.min(options.lineRange.startLine, options.lineRange.endLine),
          endLine: Math.max(options.lineRange.startLine, options.lineRange.endLine)
        }
      : undefined;

  const parsedResult = parseKYCResponse<Record<string, unknown>>(String(raw ?? ""), {
    modelName: options.modelName,
    context: "create-tutorial-script",
    expectedShape: isRecord,
    fallbackFactory: (text) => ({ _fallbackText: text })
  });

  const obj = parsedResult.parsed;
  if ("_fallbackText" in obj && typeof obj._fallbackText === "string") {
    return buildFallbackTutorial(obj._fallbackText, lineRange);
  }

  let scenes = normalizeScenes(obj.scenes, lineRange);
  const title = String(obj.title ?? "Code tutorial").trim() || "Code tutorial";
  const audience = String(obj.audience ?? "developer").trim() || "developer";
  let summary = String(obj.summary ?? obj.overview ?? "").trim();

  if (scenes.length === 0) {
    const prose = summary || JSON.stringify(obj);
    return buildFallbackTutorial(prose || title, lineRange);
  }

  if (!summary) {
    summary = scenes.map((s) => s.title).slice(0, 3).join(" · ") || title;
  }

  const diagram = normalizeDiagram(obj.diagram);
  const keyTakeaways = normalizeStringArray(obj.keyTakeaways ?? obj.takeaways, 12);

  return {
    title,
    audience,
    summary,
    scenes,
    diagram,
    keyTakeaways
  };
}
