import { logError, logInfo } from "../utils/logger";

export interface KycFallbackResponse {
  type: "text";
  content: string;
  summary: string;
  steps: string[];
  tutorials: string[];
  isParsed: false;
}

export interface ParseKycResponseOptions<T extends object> {
  modelName?: string;
  context?: string;
  expectedShape?: (value: unknown) => value is T;
  fallbackFactory?: (rawText: string) => T;
}

export interface ParseKycResponseResult<T extends object> {
  parsed: T;
  usedFallback: boolean;
  autoCorrected: boolean;
}

export function parseKYCResponse<T extends object>(
  rawResponse: string,
  options: ParseKycResponseOptions<T> = {}
): ParseKycResponseResult<T> {
  const raw = String(rawResponse ?? "");
  const parsed = tryParseUnknownJson(raw);
  if (parsed.value !== undefined) {
    if (!options.expectedShape || options.expectedShape(parsed.value)) {
      if (parsed.autoCorrected) {
        logInfo(`Response auto-corrected. model=${options.modelName ?? "unknown"} context=${options.context ?? "unknown"}`);
      }
      return {
        parsed: parsed.value as T,
        usedFallback: false,
        autoCorrected: parsed.autoCorrected
      };
    }
  }

  logParseFailure(raw, options.modelName, options.context, parsed.lastError);
  const fallbackFactory = options.fallbackFactory ?? ((text: string) => createFallbackResponse(text) as T);
  return {
    parsed: fallbackFactory(raw),
    usedFallback: true,
    autoCorrected: parsed.autoCorrected
  };
}

export function tryParseKycJsonObject<T extends object>(
  rawResponse: string,
  options: { modelName?: string; context?: string; expectedShape?: (value: unknown) => value is T } = {}
): T | undefined {
  const raw = String(rawResponse ?? "");
  const parsed = tryParseUnknownJson(raw);
  if (parsed.value !== undefined) {
    if (!options.expectedShape || options.expectedShape(parsed.value)) {
      return parsed.value as T;
    }
  }
  return undefined;
}

export function createFallbackResponse(text: string): KycFallbackResponse {
  const raw = String(text ?? "").trim();
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  return {
    type: "text",
    content: raw,
    summary: firstLine || "Unstructured model response",
    steps: [],
    tutorials: [],
    isParsed: false
  };
}

/**
 * Sanitize a garbled AI response into clean, human-readable text.
 * This is the last resort when JSON parsing completely fails.
 */
export function sanitizeForDisplay(raw: string): string {
  let text = String(raw ?? "");
  text = decodeHtmlEntities(text);
  text = stripMarkdownFences(text);
  text = text
    .replace(/[{}\[\]]/g, "")
    .replace(/"([^"]*?)"\s*:/g, "**$1:** ")
    .replace(/&quot;/gi, "")
    .replace(/"/g, "")
    .replace(/\\"/g, "")
    .replace(/,\s*$/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const lines = text.split(/\.\s+/).filter((s) => s.trim().length > 10);
  if (lines.length > 1) {
    return lines.map((line) => `- ${line.trim().replace(/[.,;]+$/, "")}.`).join("\n");
  }
  return text;
}

function tryParseUnknownJson(rawResponse: string): {
  value: unknown | undefined;
  autoCorrected: boolean;
  lastError?: string;
} {
  const raw = String(rawResponse ?? "").trim();
  if (!raw) {
    return { value: undefined, autoCorrected: false, lastError: "empty response" };
  }

  // Stage 1: Direct parse on raw input.
  const direct = parseJsonSafe(raw);
  if (direct.value !== undefined) {
    return direct;
  }

  // Stage 2: Decode HTML entities + strip fences (preserve newlines for structure).
  const decoded = decodeHtmlEntities(raw);
  const withoutFences = stripMarkdownFences(decoded);
  const normalized = withoutFences.replace(/^\uFEFF/, "").replace(/[\u201C\u201D]/g, "\"").replace(/[\u2018\u2019]/g, "'").trim();

  if (normalized !== raw) {
    const normalizedParsed = parseJsonSafe(normalized, true);
    if (normalizedParsed.value !== undefined) {
      return normalizedParsed;
    }
  }

  // Stage 3: Extract JSON payload from mixed text.
  const source = normalized || raw;
  const extracted = extractBalancedJson(source) ?? extractGreedyJson(source);
  if (!extracted) {
    return { value: undefined, autoCorrected: source !== raw, lastError: direct.error };
  }

  const extractedParsed = parseJsonSafe(extracted, true);
  if (extractedParsed.value !== undefined) {
    return extractedParsed;
  }

  // Stage 4: Aggressive multi-pass JSON repair.
  const repaired = repairJSON(extracted);
  const repairedParsed = parseJsonSafe(repaired, true);
  if (repairedParsed.value !== undefined) {
    return repairedParsed;
  }

  // Stage 5: Collapse whitespace + repair (handles newline-heavy responses).
  const collapsed = extracted.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (collapsed !== extracted) {
    const collapsedRepaired = repairJSON(collapsed);
    const collapsedParsed = parseJsonSafe(collapsedRepaired, true);
    if (collapsedParsed.value !== undefined) {
      return collapsedParsed;
    }
  }

  // Stage 6: Loose key-value extraction as last-resort structural parse.
  const loose = extractLooseKeyValues(source);
  if (loose && Object.keys(loose).length > 0) {
    return { value: loose, autoCorrected: true };
  }

  return {
    value: undefined,
    autoCorrected: true,
    lastError: repairedParsed.error ?? extractedParsed.error ?? direct.error
  };
}

function parseJsonSafe(input: string, autoCorrected = false): {
  value: unknown | undefined;
  autoCorrected: boolean;
  error?: string;
} {
  try {
    return { value: JSON.parse(input) as unknown, autoCorrected };
  } catch (error) {
    return {
      value: undefined,
      autoCorrected,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/gi, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function repairJSON(json: string): string {
  let r = json;
  r = r.replace(/,\s*([}\]])/g, "$1");
  r = r.replace(/([{,[\s])\s*([A-Za-z_$][\w$-]*)\s*:/g, "$1\"$2\":");
  r = r.replace(/([{,[\s])\s*([A-Za-z_$][\w$-]*)"\s*:/g, "$1\"$2\":");
  r = r.replace(/:\s*([A-Z][A-Za-z\s,.']+?)(?=\s*[,}\]])/g, (_, val) => `: "${val.replace(/"/g, '\\"')}"`);
  r = r.replace(/"\s+"/g, "\", \"");
  r = r.replace(/}\s*{/g, "},{");
  r = r.replace(/]\s*\[/g, "],[");
  r = r.replace(/(["\d\]}])\s*(")/g, "$1, $2");
  r = r.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, g) => `"${String(g).replace(/"/g, '\\"')}"`);
  return r;
}

function stripMarkdownFences(value: string): string {
  let t = value.trim();
  t = t.replace(/^`{1,3}json\s*/i, "");
  t = t.replace(/`{1,3}\s*$/g, "");
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  t = t.replace(/^```(?:json)?\s*/i, "");
  t = t.replace(/\s*```\s*$/i, "");
  return t.trim();
}

function extractGreedyJson(text: string): string | undefined {
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return objectMatch[0].trim();
  }
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  return arrayMatch?.[0]?.trim();
}

function extractBalancedJson(text: string): string | undefined {
  const obj = extractBalanced(text, "{", "}");
  const arr = extractBalanced(text, "[", "]");
  if (!obj) { return arr; }
  if (!arr) { return obj; }
  return text.indexOf(obj) <= text.indexOf(arr) ? obj : arr;
}

function extractBalanced(text: string, open: "{" | "[", close: "}" | "]"): string | undefined {
  const start = text.indexOf(open);
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === "\"") { inString = false; }
      continue;
    }
    if (char === "\"") { inString = true; continue; }
    if (char === open) { depth += 1; continue; }
    if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

/**
 * Last-resort structural extraction: pull key-value pairs from broken JSON text.
 * Handles responses where JSON is so mangled that repair can't fix it.
 */
function extractLooseKeyValues(text: string): Record<string, unknown> | undefined {
  const source = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!source) {
    return undefined;
  }

  const out: Record<string, unknown> = {};

  const stringPairPattern = /"?([A-Za-z_$][\w$-]*)"?\s*:\s*"([^"]*)"/g;
  let m = stringPairPattern.exec(source);
  while (m) {
    out[m[1]] = m[2].trim();
    m = stringPairPattern.exec(source);
  }

  const numberPairPattern = /"?([A-Za-z_$][\w$-]*)"?\s*:\s*(-?\d+(?:\.\d+)?)\b/g;
  m = numberPairPattern.exec(source);
  while (m) {
    if (!(m[1] in out)) {
      out[m[1]] = Number(m[2]);
    }
    m = numberPairPattern.exec(source);
  }

  const arrayPattern = /"?([A-Za-z_$][\w$-]*)"?\s*:\s*\[([^\]]*)\]/g;
  m = arrayPattern.exec(source);
  while (m) {
    const items: string[] = [];
    const itemPattern = /"([^"]+)"/g;
    let im = itemPattern.exec(m[2]);
    while (im) {
      items.push(im[1].trim());
      im = itemPattern.exec(m[2]);
    }
    if (items.length > 0) {
      out[m[1]] = items;
    }
    m = arrayPattern.exec(source);
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function logParseFailure(
  rawResponse: string,
  modelName?: string,
  context?: string,
  parseError?: string
): void {
  const snippet = rawResponse.length > 1200 ? `${rawResponse.slice(0, 1200)}...` : rawResponse;
  logError(
    [
      "Response parsing failed.",
      modelName ? `model=${modelName}` : "model=unknown",
      context ? `context=${context}` : "context=unknown",
      parseError ? `error=${parseError}` : "error=unknown",
      `raw=${JSON.stringify(snippet)}`
    ].join(" ")
  );
}
