import { ExplainFunctionResult } from "../core/types";

export function normalizeExplanationResult(payload: unknown): ExplainFunctionResult {
  if (typeof payload === "string") {
    return normalizeFromModelText(payload);
  }

  if (isExplainFunctionShape(payload)) {
    return normalizeObjectPayload(payload);
  }

  const extracted = tryParseJsonFromString(JSON.stringify(payload));
  if (extracted && isExplainFunctionShape(extracted)) {
    return normalizeObjectPayload(extracted);
  }

  return fallbackFromText(typeof payload === "object" ? JSON.stringify(payload, null, 2) : String(payload));
}

/** Parses raw model output: markdown fences, prose + JSON, object arrays, etc. */
export function normalizeFromModelText(raw: string): ExplainFunctionResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallbackFromText("");
  }

  const direct = tryParseJsonFromString(trimmed);
  if (direct && isExplainFunctionShape(direct)) {
    return normalizeObjectPayload(direct);
  }

  const extracted = extractBalancedJsonObject(trimmed);
  if (extracted) {
    try {
      const parsed = JSON.parse(extracted) as unknown;
      if (isExplainFunctionShape(parsed)) {
        return normalizeObjectPayload(parsed);
      }
    } catch {
      // continue to looser strategies
    }
  }

  const afterFences = stripMarkdownFences(trimmed);
  if (afterFences !== trimmed) {
    const again = tryParseJsonFromString(afterFences);
    if (again && isExplainFunctionShape(again)) {
      return normalizeObjectPayload(again);
    }
    const ext2 = extractBalancedJsonObject(afterFences);
    if (ext2) {
      try {
        const parsed = JSON.parse(ext2) as unknown;
        if (isExplainFunctionShape(parsed)) {
          return normalizeObjectPayload(parsed);
        }
      } catch {
        /* noop */
      }
    }
  }

  return fallbackFromText(trimmed);
}

export function parseJsonObjectFromModelText<T extends object>(raw: string): T | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const direct = tryParseJsonFromString(trimmed);
  if (isRecord(direct)) {
    return direct as T;
  }

  const extracted = extractBalancedJsonObject(trimmed);
  if (extracted) {
    try {
      const parsed = JSON.parse(extracted) as unknown;
      if (isRecord(parsed)) {
        return parsed as T;
      }
    } catch {
      // continue to fenced fallback
    }
  }

  const afterFences = stripMarkdownFences(trimmed);
  if (afterFences !== trimmed) {
    const fenced = tryParseJsonFromString(afterFences);
    if (isRecord(fenced)) {
      return fenced as T;
    }
    const extractedAfterFences = extractBalancedJsonObject(afterFences);
    if (extractedAfterFences) {
      try {
        const parsed = JSON.parse(extractedAfterFences) as unknown;
        if (isRecord(parsed)) {
          return parsed as T;
        }
      } catch {
        // ignore malformed fallback JSON
      }
    }
  }

  return undefined;
}

function normalizeObjectPayload(payload: ExplainFunctionShape): ExplainFunctionResult {
  return {
    summary: String(payload.summary ?? "").trim() || "Function explanation",
    purpose: String(payload.purpose ?? "").trim() || "No purpose was provided.",
    stepByStep: normalizeStringList(payload.stepByStep),
    inputs: normalizeStringList(payload.inputs),
    outputs: normalizeStringList(payload.outputs),
    dependencies: normalizeStringList(payload.dependencies),
    risks: normalizeStringList(payload.risks),
    connectedFlow: normalizeStringList(payload.connectedFlow),
    confidence: normalizeConfidence(payload.confidence)
  };
}

type ExplainFunctionShape = {
  summary?: unknown;
  purpose?: unknown;
  stepByStep?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  dependencies?: unknown;
  risks?: unknown;
  connectedFlow?: unknown;
  confidence?: unknown;
};

function isExplainFunctionShape(value: unknown): value is ExplainFunctionShape {
  return typeof value === "object" && value !== null && ("summary" in value || "purpose" in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJsonFromString(text: string): unknown | undefined {
  const t = text.trim();
  try {
    return JSON.parse(t) as unknown;
  } catch {
    const repaired = repairLikelyJson(t);
    if (repaired !== t) {
      try {
        return JSON.parse(repaired) as unknown;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function repairLikelyJson(value: string): string {
  let repaired = value
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/,\s*([}\]])/g, "$1");

  repaired = normalizeSingleQuotedPairs(repaired);
  repaired = escapeUnterminatedInnerQuotes(repaired);
  return repaired;
}

function normalizeSingleQuotedPairs(value: string): string {
  // Converts simple single-quoted keys/values to double-quoted JSON-safe text.
  return value.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, group) => {
    const normalized = String(group).replace(/"/g, "\\\"");
    return `"${normalized}"`;
  });
}

function escapeUnterminatedInnerQuotes(value: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (!inString) {
      out += char;
      if (char === "\"") {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      out += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      out += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      const next = nextNonWhitespaceChar(value, i + 1);
      if (next === "," || next === "}" || next === "]" || next === ":" || next === undefined) {
        out += char;
        inString = false;
      } else {
        out += "\\\"";
      }
      continue;
    }

    out += char;
  }

  return out;
}

function nextNonWhitespaceChar(value: string, start: number): string | undefined {
  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return undefined;
}

/**
 * Strips ```json ... ``` fences and stray backticks; does not require balanced fences.
 */
function stripMarkdownFences(text: string): string {
  let t = text.trim();
  t = t.replace(/^`{2,}json\s*/i, "");
  t = t.replace(/`{2,}\s*$/g, "");
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  t = t.replace(/^```(?:json)?\s*/i, "");
  t = t.replace(/\s*```\s*$/m, "");
  t = t.replace(/^`json\s*/i, "");
  t = t.replace(/\s*`$/g, "");
  return t.trim();
}

/**
 * Finds the first `{` and returns the balanced `{ ... }` substring (JSON-safe string handling).
 */
function extractBalancedJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const c = text[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === "\"") {
        inString = false;
        continue;
      }
      continue;
    }

    if (c === "\"") {
      inString = true;
      continue;
    }

    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === "string") {
    const t = value.trim();
    return t ? [t] : [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatStructuredItem(item)).filter((s) => Boolean(s?.trim()));
  }

  if (typeof value === "object") {
    const s = formatStructuredItem(value);
    return s.trim() ? [s] : [];
  }

  return [String(value)];
}

function formatStructuredItem(item: unknown): string {
  if (item === null || item === undefined) {
    return "";
  }
  if (typeof item === "string") {
    return item.trim();
  }
  if (typeof item !== "object") {
    return String(item);
  }

  const o = item as Record<string, unknown>;

  if (("line" in o || "startLine" in o || "endLine" in o) && ("text" in o || "explanation" in o || "detail" in o)) {
    const line = o.line;
    const startLine = o.startLine;
    const endLine = o.endLine;
    const text = o.text ?? o.explanation ?? o.detail ?? "";

    const lineLabel = typeof line === "number"
      ? `L${line}`
      : (typeof startLine === "number" && typeof endLine === "number")
        ? `L${startLine}-${endLine}`
        : "";

    const body = String(text).trim();
    return `${lineLabel ? `${lineLabel}: ` : ""}${body}`.trim();
  }

  if ("risk" in o || "category" in o || "severity" in o || "fix" in o) {
    const parts: string[] = [];
    if (o.category !== undefined) {
      parts.push(String(o.category));
    }
    if (o.severity !== undefined) {
      parts.push(`[${String(o.severity)}]`);
    }
    if (o.risk !== undefined) {
      parts.push(String(o.risk));
    }
    if (o.fix !== undefined) {
      parts.push(`Fix: ${String(o.fix)}`);
    }
    return parts.filter(Boolean).join(" — ");
  }

  if ("name" in o && ("usage" in o || "type" in o)) {
    const name = String(o.name ?? "");
    const type = o.type !== undefined ? ` (${String(o.type)})` : "";
    const usage = o.usage !== undefined ? `: ${String(o.usage)}` : "";
    return `${name}${type}${usage}`.trim();
  }

  if ("name" in o || "type" in o || "description" in o || "purpose" in o) {
    const name = o.name !== undefined ? String(o.name) : "";
    const type = o.type !== undefined ? `: ${String(o.type)}` : "";
    const desc = o.description ?? o.purpose ?? o.value;
    const rest = desc !== undefined ? ` — ${String(desc)}` : "";
    const head = name ? `${name}${type}` : type.replace(/^:\s*/, "");
    return `${head}${rest}`.trim();
  }

  return Object.entries(o)
    .map(([k, v]) => {
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        return `${k}: ${formatStructuredItem(v)}`;
      }
      return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .join("; ");
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return 0.5;
}

function fallbackFromText(text: string): ExplainFunctionResult {
  const cleaned = text.trim();
  const firstLine = cleaned.split(/\r?\n/, 1)[0] ?? "";
  return {
    summary: firstLine || "Function explanation",
    purpose: cleaned || "The model returned an unstructured explanation.",
    stepByStep: [],
    inputs: [],
    outputs: [],
    dependencies: [],
    risks: [],
    connectedFlow: [],
    confidence: 0.35
  };
}
