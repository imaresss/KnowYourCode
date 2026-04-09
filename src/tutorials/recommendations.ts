import { sha256 } from "../utils/hash";
import { TutorialRepository } from "../cache/tutorialRepo";
import { logInfo } from "../utils/logger";

export interface TutorialSource {
  name: string;
  url: string;
}

export interface TutorialRecommendation {
  identifier: string;
  language: string;
  summary: string;
  sources: TutorialSource[];
}

export interface TutorialResult {
  tutorials: TutorialRecommendation[];
  fromCache: boolean;
}

interface TutorialCatalogEntry {
  summary: string;
  sources: TutorialSource[];
  aliases?: string[];
}

interface DetectionSnapshot {
  localDefinitions: Set<string>;
  importedDefinitions: Set<string>;
  detectedBuiltIns: Set<string>;
}

interface CandidateScan {
  candidates: Set<string>;
  localDefinitions: Set<string>;
  importedDefinitions: Set<string>;
}

const recommendationCache = new Map<string, TutorialRecommendation[]>();
const detectionCache = new Map<string, DetectionSnapshot>();
const inFlight = new Map<string, Promise<TutorialResult>>();

let persistentRepo: TutorialRepository | undefined;

/**
 * Global method map: language → lowercased method → TutorialRecommendation.
 * Pre-warmed from static catalogs for instant cross-code lookups.
 */
const globalMethodMap = new Map<string, Map<string, TutorialRecommendation>>();

export function initTutorialCache(repo: TutorialRepository): void {
  persistentRepo = repo;
  warmGlobalMethodMap();
}

function warmGlobalMethodMap(): void {
  const catalogs: Record<string, Record<string, TutorialCatalogEntry>> = {
    javascript: JS_TS_CATALOG,
    typescript: JS_TS_CATALOG,
    python: PYTHON_CATALOG,
    java: JAVA_CATALOG
  };

  for (const [lang, catalog] of Object.entries(catalogs)) {
    const langMap = new Map<string, TutorialRecommendation>();
    for (const [canonical, entry] of Object.entries(catalog)) {
      const rec: TutorialRecommendation = {
        identifier: canonical,
        language: lang,
        summary: entry.summary,
        sources: entry.sources
      };
      langMap.set(canonical.toLowerCase(), rec);
      for (const alias of entry.aliases ?? []) {
        langMap.set(alias.toLowerCase(), rec);
      }
    }
    globalMethodMap.set(lang, langMap);
  }
}

/**
 * Look up a single built-in method by name from the global cache.
 * Zero computation — instant O(1) lookup.
 */
export function lookupGlobalTutorial(methodName: string, language: string): TutorialRecommendation | undefined {
  return globalMethodMap.get(normalizeLanguage(language))?.get(methodName.toLowerCase());
}

const JS_TS_CATALOG: Record<string, TutorialCatalogEntry> = {
  "Array.map": {
    summary: "Transforms each element in an array and returns a new array.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map" }],
    aliases: ["map"]
  },
  "Array.filter": {
    summary: "Keeps array elements that match a predicate.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter" }],
    aliases: ["filter"]
  },
  "Array.reduce": {
    summary: "Combines array values into a single result.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce" }],
    aliases: ["reduce"]
  },
  "Array.forEach": {
    summary: "Iterates through each array element for side effects.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach" }],
    aliases: ["forEach"]
  },
  "Promise": {
    summary: "Represents an asynchronous operation and its eventual result.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise" }],
    aliases: ["Promise", "Promise.all", "Promise.race", "Promise.resolve"]
  },
  "JSON.parse": {
    summary: "Parses a JSON string into a JavaScript value.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse" }],
    aliases: ["JSON.parse", "parse"]
  },
  "JSON.stringify": {
    summary: "Converts a JavaScript value to a JSON string.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify" }],
    aliases: ["JSON.stringify", "stringify"]
  },
  "Object.keys": {
    summary: "Returns an array of an object's own enumerable property names.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys" }],
    aliases: ["Object.keys", "keys"]
  },
  "Object.values": {
    summary: "Returns an array of an object's own enumerable property values.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/values" }],
    aliases: ["Object.values", "values"]
  },
  "Object.entries": {
    summary: "Returns an array of key/value pairs for object properties.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries" }],
    aliases: ["Object.entries", "entries"]
  },
  "Array.from": {
    summary: "Creates a new array instance from an iterable or array-like value.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from" }],
    aliases: ["Array.from", "from"]
  },
  "Math.random": {
    summary: "Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random" }],
    aliases: ["Math.random", "random"]
  },
  "console.log": {
    summary: "Prints diagnostic output to the console.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/console/log_static" }],
    aliases: ["console.log", "log"]
  },
  setTimeout: {
    summary: "Schedules a callback to run after a delay.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/setTimeout" }],
    aliases: ["setTimeout"]
  },
  fetch: {
    summary: "Performs network requests and returns a Promise.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/fetch" }],
    aliases: ["fetch"]
  },
  "async/await": {
    summary: "Syntax for writing asynchronous Promise-based code in a linear style.",
    sources: [{ name: "MDN", url: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises" }],
    aliases: ["async", "await", "async/await"]
  }
};

const PYTHON_CATALOG: Record<string, TutorialCatalogEntry> = {
  len: {
    summary: "Returns the number of items in a container.",
    sources: [{ name: "Python Docs", url: "https://docs.python.org/3/library/functions.html#len" }]
  },
  range: {
    summary: "Generates an immutable sequence of numbers.",
    sources: [{ name: "Python Docs", url: "https://docs.python.org/3/library/functions.html#func-range" }]
  },
  map: {
    summary: "Applies a function to each item of one or more iterables.",
    sources: [{ name: "Python Docs", url: "https://docs.python.org/3/library/functions.html#map" }]
  },
  filter: {
    summary: "Constructs an iterator from elements where a function returns true.",
    sources: [{ name: "Python Docs", url: "https://docs.python.org/3/library/functions.html#filter" }]
  },
  print: {
    summary: "Prints values to a stream, usually standard output.",
    sources: [{ name: "Python Docs", url: "https://docs.python.org/3/library/functions.html#print" }]
  },
  enumerate: {
    summary: "Iterates over values while tracking their index.",
    sources: [{ name: "Python Docs", url: "https://docs.python.org/3/library/functions.html#enumerate" }]
  },
  sorted: {
    summary: "Returns a new sorted list from any iterable.",
    sources: [{ name: "Python Docs", url: "https://docs.python.org/3/library/functions.html#sorted" }]
  },
  "async/await": {
    summary: "Core asynchronous programming syntax in Python.",
    sources: [{ name: "Python Docs", url: "https://docs.python.org/3/library/asyncio.html" }],
    aliases: ["async", "await", "async/await"]
  }
};

const JAVA_CATALOG: Record<string, TutorialCatalogEntry> = {
  "Stream.map": {
    summary: "Transforms stream elements with a mapping function.",
    sources: [{ name: "Oracle Docs", url: "https://docs.oracle.com/javase/8/docs/api/java/util/stream/Stream.html#map-java.util.function.Function-" }],
    aliases: ["map"]
  },
  "Stream.filter": {
    summary: "Filters stream elements using a predicate.",
    sources: [{ name: "Oracle Docs", url: "https://docs.oracle.com/javase/8/docs/api/java/util/stream/Stream.html#filter-java.util.function.Predicate-" }],
    aliases: ["filter"]
  },
  "Stream.collect": {
    summary: "Performs a mutable reduction operation on stream elements.",
    sources: [{ name: "Oracle Docs", url: "https://docs.oracle.com/javase/8/docs/api/java/util/stream/Stream.html#collect-java.util.stream.Collector-" }],
    aliases: ["collect"]
  },
  Optional: {
    summary: "Container object which may or may not contain a non-null value.",
    sources: [{ name: "Oracle Docs", url: "https://docs.oracle.com/javase/8/docs/api/java/util/Optional.html" }],
    aliases: ["Optional", "Optional.of", "Optional.ofNullable", "Optional.orElse"]
  },
  CompletableFuture: {
    summary: "Represents an asynchronous computation result in Java.",
    sources: [{ name: "Oracle Docs", url: "https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/CompletableFuture.html" }],
    aliases: ["CompletableFuture", "thenApply", "thenCompose"]
  },
  Stream: {
    summary: "A sequence of elements supporting aggregate operations.",
    sources: [{ name: "Oracle Docs", url: "https://docs.oracle.com/javase/8/docs/api/java/util/stream/Stream.html" }],
    aliases: ["Stream", "stream"]
  }
};

const GENERIC_CATALOG: Record<string, TutorialCatalogEntry> = {};
const EXTRA_LANGUAGE_BUILTINS: Record<string, string[]> = {
  go: ["len", "cap", "append", "copy", "make", "new", "delete", "close", "panic", "recover", "fmt.Println", "fmt.Sprintf", "strings.Split", "strings.Join"],
  rust: ["Vec", "Option", "Result", "String", "HashMap", "iter", "map", "filter", "collect", "unwrap", "expect"],
  csharp: ["Task", "Console.WriteLine", "string.Split", "string.Join", "Enumerable.Select", "Enumerable.Where", "ToList"],
  php: ["array_map", "array_filter", "array_reduce", "count", "json_encode", "json_decode", "explode", "implode"],
  ruby: ["Array#map", "Array#select", "Array#reduce", "Hash#each", "puts", "print", "split", "join"],
  kotlin: ["listOf", "mutableListOf", "map", "filter", "forEach", "let", "run", "apply", "also", "with"],
  swift: ["map", "filter", "reduce", "forEach", "compactMap", "flatMap", "print", "guard", "if let"]
};

export interface TutorialLookupOptions {
  /** Code of the enclosing function (enables function→selection cache reuse). */
  enclosingFunctionCode?: string;
}

export async function getTutorialRecommendations(
  code: string,
  language: string,
  options?: TutorialLookupOptions
): Promise<TutorialResult> {
  const normalizedLanguage = normalizeLanguage(language);
  const hash = sha256(code);
  const key = `${normalizedLanguage}:${hash}`;

  // Layer 1: In-memory cache (instant).
  const memoryCached = recommendationCache.get(key);
  if (memoryCached) {
    return { tutorials: memoryCached, fromCache: true };
  }

  // Layer 2: Function→selection reuse — if the enclosing function's tutorials
  // are cached, filter them for this selection instead of re-scanning.
  if (options?.enclosingFunctionCode && options.enclosingFunctionCode !== code) {
    const reused = tryReuseFunctionTutorials(options.enclosingFunctionCode, code, normalizedLanguage);
    if (reused) {
      recommendationCache.set(key, reused);
      return { tutorials: reused, fromCache: true };
    }
  }

  // Layer 3: Persistent DB cache (survives restarts).
  if (persistentRepo) {
    const dbCached = persistentRepo.find(hash, normalizedLanguage);
    if (dbCached) {
      recommendationCache.set(key, dbCached);
      logInfo(`Tutorial cache hit (DB): ${normalizedLanguage} ${dbCached.length} tutorial(s)`);
      return { tutorials: dbCached, fromCache: true };
    }
  }

  // Layer 4: Dedup in-flight requests.
  const running = inFlight.get(key);
  if (running) {
    return running;
  }

  const request = Promise.resolve().then(() => {
    const recommendations = buildRecommendations(code, normalizedLanguage, hash);
    recommendationCache.set(key, recommendations);
    persistentRepo?.save(hash, normalizedLanguage, recommendations);
    return { tutorials: recommendations, fromCache: false } as TutorialResult;
  });

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Reuse a cached function's tutorials for a selection within that function.
 * Filters tutorials to only those whose identifiers appear in the selected code.
 */
function tryReuseFunctionTutorials(
  functionCode: string,
  selectedCode: string,
  language: string
): TutorialRecommendation[] | undefined {
  const fnHash = sha256(functionCode);
  const fnKey = `${language}:${fnHash}`;
  const functionTutorials = recommendationCache.get(fnKey) ?? persistentRepo?.find(fnHash, language);
  if (!functionTutorials || functionTutorials.length === 0) {
    return undefined;
  }

  const selectedLower = selectedCode.toLowerCase();
  const relevant = functionTutorials.filter((t) => {
    const idLower = t.identifier.toLowerCase();
    const leaf = idLower.includes(".") ? idLower.split(".").pop()! : idLower;
    return selectedLower.includes(leaf) || selectedLower.includes(idLower);
  });

  if (relevant.length === 0) {
    return undefined;
  }

  logInfo(`Tutorial function→selection reuse: ${relevant.length}/${functionTutorials.length} tutorial(s)`);
  return relevant;
}

function buildRecommendations(code: string, language: string, hash: string): TutorialRecommendation[] {
  const snapshot = detectBuiltInIdentifiers(code, language, hash);
  const catalog = getCatalog(language);
  return Array.from(snapshot.detectedBuiltIns)
    .map((identifier) => {
      const entry = catalog[identifier];
      return {
        identifier,
        language,
        summary: entry?.summary ?? inferDynamicSummary(identifier, language),
        sources: dedupeSources(entry?.sources ?? buildDynamicSources(identifier, language))
      } as TutorialRecommendation;
    })
    .filter((item): item is TutorialRecommendation => item.sources.length > 0)
    .slice(0, 10);
}

function detectBuiltInIdentifiers(code: string, language: string, hash: string): DetectionSnapshot {
  const cacheKey = `${language}:${hash}`;
  const cached = detectionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const scan = scanCandidates(code, language);
  const aliasMap = getAliasMap(language);
  const detectedBuiltIns = filterBuiltIns(scan, aliasMap);
  const snapshot: DetectionSnapshot = {
    localDefinitions: scan.localDefinitions,
    importedDefinitions: scan.importedDefinitions,
    detectedBuiltIns
  };
  detectionCache.set(cacheKey, snapshot);
  return snapshot;
}

function scanCandidates(code: string, language: string): CandidateScan {
  switch (language) {
    case "javascript":
    case "typescript":
      return scanJsTsCandidates(code, language);
    case "python":
      return scanPythonCandidates(code);
    case "java":
      return scanJavaCandidates(code);
    default:
      return scanGenericCandidates(code);
  }
}

function scanGenericCandidates(code: string): CandidateScan {
  const candidates = new Set<string>();
  const localDefinitions = new Set<string>();
  const importedDefinitions = new Set<string>();

  // Broad function/variable declaration patterns across multiple languages.
  captureMatches(/\b(?:function|def|fn|fun)\s+([A-Za-z_][\w]*)\s*\(/g, code, localDefinitions, 1);
  captureMatches(/\b(?:class|struct|interface|enum|type)\s+([A-Za-z_][\w]*)\b/g, code, localDefinitions, 1);
  captureMatches(/\b(?:const|let|var|val|final|mut)\s+([A-Za-z_][\w]*)\b/g, code, localDefinitions, 1);

  // Import aliases.
  captureMatches(/\bimport\s+([A-Za-z_][\w]*)\b/g, code, importedDefinitions, 1);
  captureMatches(/\buse\s+([A-Za-z_][\w]*)\b/g, code, importedDefinitions, 1);
  captureMatches(/\bfrom\s+[A-Za-z_][\w.]*\s+import\s+([A-Za-z_][\w]*)\b/g, code, importedDefinitions, 1);

  // Generic function/method call candidates.
  captureMatches(/\b([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?)\s*\(/g, code, candidates, 1);
  for (const item of Array.from(candidates)) {
    candidates.add(lastSegment(item));
  }

  return { candidates, localDefinitions, importedDefinitions };
}

function scanJsTsCandidates(code: string, language: string): CandidateScan {
  const ts = tryRequireTypeScript();
  if (!ts) {
    return scanJsTsWithRegexFallback(code);
  }

  const scriptKind = language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile("kyc.ts", code, ts.ScriptTarget.Latest, true, scriptKind);
  const candidates = new Set<string>();
  const localDefinitions = new Set<string>();
  const importedDefinitions = new Set<string>();

  const visit = (node: unknown): void => {
    if (ts.isImportClause(node)) {
      const clause = node as ImportClauseLike;
      if (clause.name && ts.isIdentifier(clause.name)) {
        addLocal(importedDefinitions, clause.name.text);
      }
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        addLocal(importedDefinitions, clause.namedBindings.name.text);
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          addLocal(importedDefinitions, element.name.text);
        }
      }
    }

    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      const namedNode = node as { name?: unknown };
      if (namedNode.name && ts.isIdentifier(namedNode.name)) {
        addLocal(localDefinitions, namedNode.name.text);
      }
    }

    if (ts.isVariableDeclaration(node)) {
      collectBindingNames(ts, (node as VariableDeclarationLike).name, localDefinitions);
    }

    if (ts.isParameter(node)) {
      collectBindingNames(ts, (node as VariableDeclarationLike).name, localDefinitions);
    }

    if (ts.isCatchClause(node)) {
      const variable = (node as CatchClauseLike).variableDeclaration;
      if (variable) {
        collectBindingNames(ts, variable.name, localDefinitions);
      }
    }

    if (ts.isCallExpression(node)) {
      const callExpression = node as CallExpressionLike;
      if (ts.isIdentifier(callExpression.expression)) {
        candidates.add(callExpression.expression.text);
      }
      if (ts.isPropertyAccessExpression(callExpression.expression)) {
        const chain = readPropertyChain(ts, callExpression.expression, sourceFile);
        if (chain) {
          candidates.add(chain);
          candidates.add(lastSegment(chain));
        }
      }
    }

    if (ts.isNewExpression(node)) {
      const newExpression = node as NewExpressionLike;
      if (newExpression.expression && ts.isIdentifier(newExpression.expression)) {
        candidates.add(newExpression.expression.text);
      }
    }

    if (ts.isAwaitExpression(node) || (ts.isFunctionLike(node) && hasAsyncModifier(ts, node))) {
      candidates.add("async/await");
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { candidates, localDefinitions, importedDefinitions };
}

function scanJsTsWithRegexFallback(code: string): CandidateScan {
  const candidates = new Set<string>();
  const localDefinitions = new Set<string>();
  const importedDefinitions = new Set<string>();

  captureMatches(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, code, localDefinitions, 1);
  captureMatches(/\b(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g, code, localDefinitions, 1);
  captureMatches(/\bimport\s+(?:[A-Za-z_$][\w$]*|\*\s+as\s+[A-Za-z_$][\w$]*|\{([^}]+)\})\s+from\s+["'][^"']+["']/g, code, importedDefinitions, 1);
  captureMatches(/\b([A-Za-z_$][\w$]*)\s*\(/g, code, candidates, 1);
  captureMatches(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\(/g, code, candidates, 1);
  captureMatches(/\b(async|await)\b/g, code, candidates, 1);

  for (const rawImport of Array.from(importedDefinitions)) {
    for (const item of rawImport.split(",")) {
      const cleaned = item.trim().split(/\s+as\s+/i).pop() ?? "";
      addLocal(importedDefinitions, cleaned.replace(/[{}]/g, ""));
    }
  }

  return { candidates, localDefinitions, importedDefinitions };
}

function scanPythonCandidates(code: string): CandidateScan {
  const candidates = new Set<string>();
  const localDefinitions = new Set<string>();
  const importedDefinitions = new Set<string>();
  const lines = code.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) {
      continue;
    }

    const defMatch = trimmed.match(/^def\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/);
    if (defMatch) {
      addLocal(localDefinitions, defMatch[1]);
      for (const parameter of defMatch[2].split(",")) {
        addLocal(localDefinitions, parameter.trim().split("=")[0].trim());
      }
      continue;
    }

    const classMatch = trimmed.match(/^class\s+([A-Za-z_][\w]*)/);
    if (classMatch) {
      addLocal(localDefinitions, classMatch[1]);
      continue;
    }

    const importFromMatch = trimmed.match(/^from\s+[A-Za-z_][\w.]*\s+import\s+(.+)$/);
    if (importFromMatch) {
      for (const part of importFromMatch[1].split(",")) {
        const alias = part.trim().split(/\s+as\s+/i).pop() ?? "";
        addLocal(importedDefinitions, alias);
      }
    }

    const importMatch = trimmed.match(/^import\s+(.+)$/);
    if (importMatch) {
      for (const part of importMatch[1].split(",")) {
        const alias = part.trim().split(/\s+as\s+/i).pop() ?? "";
        addLocal(importedDefinitions, alias.split(".")[0]);
      }
    }

    const assignMatch = trimmed.match(/^([A-Za-z_][\w]*)\s*=/);
    if (assignMatch) {
      addLocal(localDefinitions, assignMatch[1]);
    }

    for (const candidate of findMatches(trimmed, /\b([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?)\s*\(/g, 1)) {
      candidates.add(candidate);
      candidates.add(lastSegment(candidate));
    }

    if (/\basync\b|\bawait\b/.test(trimmed)) {
      candidates.add("async/await");
    }
  }

  return { candidates, localDefinitions, importedDefinitions };
}

function scanJavaCandidates(code: string): CandidateScan {
  const candidates = new Set<string>();
  const localDefinitions = new Set<string>();
  const importedDefinitions = new Set<string>();
  const lines = code.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) {
      continue;
    }

    const importMatch = trimmed.match(/^import\s+([\w.]+);/);
    if (importMatch) {
      const className = importMatch[1].split(".").pop() ?? "";
      addLocal(importedDefinitions, className);
      continue;
    }

    const methodDeclaration = trimmed.match(
      /^(?:public|private|protected|static|final|synchronized|abstract|\s)+[\w<>\[\]]+\s+([A-Za-z_][\w]*)\s*\(/
    );
    if (methodDeclaration) {
      addLocal(localDefinitions, methodDeclaration[1]);
    }

    const variableDeclaration = trimmed.match(/^(?:final\s+)?[\w<>\[\]]+\s+([A-Za-z_][\w]*)\s*(?:=|;)/);
    if (variableDeclaration) {
      addLocal(localDefinitions, variableDeclaration[1]);
    }

    for (const candidate of findMatches(trimmed, /\b([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?)\s*\(/g, 1)) {
      candidates.add(candidate);
      candidates.add(lastSegment(candidate));
    }
  }

  for (const classToken of ["Stream", "Optional", "CompletableFuture"]) {
    if (new RegExp(`\\b${classToken}\\b`).test(code)) {
      candidates.add(classToken);
    }
  }

  return { candidates, localDefinitions, importedDefinitions };
}

function filterBuiltIns(scan: CandidateScan, aliasMap: Map<string, string>): Set<string> {
  const locals = toLowerSet(scan.localDefinitions);
  const imports = toLowerSet(scan.importedDefinitions);
  const builtIns = new Set<string>();

  for (const rawCandidate of scan.candidates) {
    const candidate = normalizeIdentifier(rawCandidate);
    if (!candidate) {
      continue;
    }
    const candidateLower = candidate.toLowerCase();
    const leaf = lastSegment(candidateLower);
    const root = candidateLower.includes(".") ? candidateLower.split(".")[0] : candidateLower;
    const canonical = aliasMap.get(candidateLower) ?? aliasMap.get(leaf);
    if (!canonical) {
      continue;
    }
    if (locals.has(candidateLower) || locals.has(leaf) || imports.has(candidateLower) || imports.has(leaf)) {
      continue;
    }
    // Shadowed globals (e.g., const map = () => {} or const Promise = ...).
    if (candidateLower.includes(".") && (locals.has(root) || imports.has(root))) {
      continue;
    }
    builtIns.add(canonical);
  }

  return builtIns;
}

function getCatalog(language: string): Record<string, TutorialCatalogEntry> {
  switch (language) {
    case "javascript":
    case "typescript":
      return JS_TS_CATALOG;
    case "python":
      return PYTHON_CATALOG;
    case "java":
      return JAVA_CATALOG;
    default:
      return GENERIC_CATALOG;
  }
}

function getAliasMap(language: string): Map<string, string> {
  const catalog = getCatalog(language);
  const map = buildAliasMap(catalog);
  const extras = EXTRA_LANGUAGE_BUILTINS[language] ?? [];
  for (const item of extras) {
    const canonical = item;
    const lower = canonical.toLowerCase();
    map.set(lower, canonical);
    map.set(lastSegment(lower), canonical);
  }
  return map;
}

function inferDynamicSummary(identifier: string, language: string): string {
  return `\`${identifier}\` is a native/standard API detected for ${language}.`;
}

function buildDynamicSources(identifier: string, language: string): TutorialSource[] {
  const encoded = encodeURIComponent(identifier);
  switch (language) {
    case "javascript":
    case "typescript":
      return [{ name: "MDN Search", url: `https://developer.mozilla.org/en-US/search?q=${encoded}` }];
    case "python":
      return [{ name: "Python Docs Search", url: `https://docs.python.org/3/search.html?q=${encoded}` }];
    case "java":
      return [{ name: "Oracle Java Docs Search", url: `https://docs.oracle.com/en/java/javase/21/docs/api/search.html?q=${encoded}` }];
    case "go":
      return [{ name: "Go Packages Search", url: `https://pkg.go.dev/search?q=${encoded}` }];
    case "rust":
      return [{ name: "Rust Std Search", url: `https://doc.rust-lang.org/std/?search=${encoded}` }];
    case "csharp":
      return [{ name: ".NET Docs Search", url: `https://learn.microsoft.com/en-us/search/?terms=${encodeURIComponent(`${identifier} .NET`)}` }];
    case "php":
      return [{ name: "PHP Docs Search", url: `https://www.php.net/manual-lookup.php?pattern=${encoded}` }];
    case "ruby":
      return [{ name: "Ruby Docs", url: `https://docs.ruby-lang.org/en/master/` }];
    case "kotlin":
      return [{ name: "Kotlin Stdlib", url: `https://kotlinlang.org/api/latest/jvm/stdlib/` }];
    case "swift":
      return [{ name: "Swift Standard Library", url: `https://developer.apple.com/documentation/swift/swift-standard-library` }];
    default:
      return [];
  }
}

function buildAliasMap(catalog: Record<string, TutorialCatalogEntry>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, entry] of Object.entries(catalog)) {
    map.set(canonical.toLowerCase(), canonical);
    for (const alias of entry.aliases ?? []) {
      map.set(alias.toLowerCase(), canonical);
    }
    map.set(lastSegment(canonical.toLowerCase()), canonical);
  }
  return map;
}

function collectBindingNames(ts: TypeScriptLike, nameNode: unknown, output: Set<string>): void {
  if (!nameNode) {
    return;
  }
  if (ts.isIdentifier(nameNode)) {
    addLocal(output, nameNode.text);
    return;
  }
  if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
    const pattern = nameNode as { elements?: ReadonlyArray<{ name?: unknown }> };
    for (const element of pattern.elements ?? []) {
      collectBindingNames(ts, element.name, output);
    }
  }
}

function readPropertyChain(ts: TypeScriptLike, node: unknown, sourceFile: unknown): string | undefined {
  const parts: string[] = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.getText(sourceFile));
    current = current.expression;
  }
  if (ts.isIdentifier(current)) {
    parts.unshift(current.text);
    return parts.join(".");
  }
  return undefined;
}

function addLocal(target: Set<string>, rawValue: string | undefined): void {
  const normalized = normalizeIdentifier(rawValue ?? "");
  if (normalized) {
    target.add(normalized);
  }
}

function normalizeIdentifier(value: string): string {
  return String(value ?? "").trim().replace(/[^\w$.]/g, "");
}

function toLowerSet(source: Set<string>): Set<string> {
  return new Set(Array.from(source).map((item) => item.toLowerCase()));
}

function lastSegment(value: string): string {
  const segments = value.split(".");
  return segments[segments.length - 1] ?? value;
}

function dedupeSources(sources: TutorialSource[]): TutorialSource[] {
  const deduped = new Map<string, TutorialSource>();
  for (const source of sources) {
    deduped.set(source.url, source);
  }
  return Array.from(deduped.values());
}

function captureMatches(regex: RegExp, source: string, target: Set<string>, group: number): void {
  let match = regex.exec(source);
  while (match) {
    addLocal(target, match[group]);
    match = regex.exec(source);
  }
}

function findMatches(source: string, regex: RegExp, group: number): string[] {
  const result: string[] = [];
  let match = regex.exec(source);
  while (match) {
    const item = normalizeIdentifier(match[group] ?? "");
    if (item) {
      result.push(item);
    }
    match = regex.exec(source);
  }
  return result;
}

function normalizeLanguage(language: string): string {
  const normalized = String(language ?? "").toLowerCase();
  if (normalized === "javascriptreact") {
    return "javascript";
  }
  if (normalized === "typescriptreact") {
    return "typescript";
  }
  return normalized;
}

function hasAsyncModifier(ts: TypeScriptLike, node: { modifiers?: ReadonlyArray<{ kind: number }> }): boolean {
  if (!node.modifiers || node.modifiers.length === 0) {
    return false;
  }
  return node.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
}

interface TypeScriptLike {
  ScriptKind: { TS: number; JS: number };
  ScriptTarget: { Latest: number };
  SyntaxKind: { AsyncKeyword: number };
  createSourceFile: (fileName: string, sourceText: string, languageVersion: number, setParentNodes: boolean, scriptKind?: number) => unknown;
  forEachChild: (node: unknown, cbNode: (node: unknown) => void) => void;
  isIdentifier: (node: unknown) => node is { text: string };
  isPropertyAccessExpression: (node: unknown) => node is { expression: unknown; name: { getText: (sourceFile?: unknown) => string } };
  isCallExpression: (node: unknown) => node is { expression: unknown };
  isAwaitExpression: (node: unknown) => boolean;
  isFunctionLike: (node: unknown) => node is { modifiers?: ReadonlyArray<{ kind: number }> };
  isNewExpression: (node: unknown) => node is { expression?: unknown };
  isFunctionDeclaration: (node: unknown) => boolean;
  isClassDeclaration: (node: unknown) => boolean;
  isVariableDeclaration: (node: unknown) => boolean;
  isParameter: (node: unknown) => boolean;
  isCatchClause: (node: unknown) => boolean;
  isImportClause: (node: unknown) => boolean;
  isNamespaceImport: (node: unknown) => node is { name: { text: string } };
  isNamedImports: (node: unknown) => node is { elements: ReadonlyArray<{ name: { text: string } }> };
  isObjectBindingPattern: (node: unknown) => boolean;
  isArrayBindingPattern: (node: unknown) => boolean;
}

interface ImportClauseLike {
  name?: unknown;
  namedBindings?: unknown;
}

interface VariableDeclarationLike {
  name: unknown;
}

interface CatchClauseLike {
  variableDeclaration?: { name: unknown };
}

interface CallExpressionLike {
  expression: unknown;
}

interface NewExpressionLike {
  expression?: unknown;
}

function tryRequireTypeScript(): TypeScriptLike | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require("typescript") as TypeScriptLike;
  } catch {
    return undefined;
  }
}
