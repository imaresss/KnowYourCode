import { sha256 } from "../utils/hash";

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

interface TutorialRegistryEntry {
  abstract: string;
  abstractUrl: string;
}

const cache = new Map<string, TutorialRecommendation[]>();
const inFlight = new Map<string, Promise<TutorialRecommendation[]>>();

export async function getTutorialRecommendations(code: string, language: string): Promise<TutorialRecommendation[]> {
  const normalizedLanguage = normalizeLanguage(language);
  const key = `${normalizedLanguage}:${sha256(code)}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const running = inFlight.get(key);
  if (running) {
    return running;
  }

  const request = (async () => {
  const detectedIdentifiers = detectIdentifiers(code, normalizedLanguage);
    const recommendations = await mapIdentifiersToTutorials(detectedIdentifiers, normalizedLanguage);
  cache.set(key, recommendations);
    return recommendations;
  })();
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

function detectIdentifiers(code: string, language: string): Set<string> {
  switch (language) {
    case "javascript":
    case "typescript":
      return detectJsTsIdentifiers(code, language);
    case "python":
      return detectPythonIdentifiers(code);
    case "java":
      return detectJavaIdentifiers(code);
    default:
      return detectGenericIdentifiers(code);
  }
}

function detectJsTsIdentifiers(code: string, language: string): Set<string> {
  const identifiers = new Set<string>();
  const ts = tryRequireTypeScript();
  if (ts) {
    const scriptKind = language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sourceFile = ts.createSourceFile("kyc.ts", code, ts.ScriptTarget.Latest, true, scriptKind);

    const visit = (node: unknown): void => {
      if (ts.isCallExpression(node)) {
        if (ts.isPropertyAccessExpression(node.expression)) {
          const methodName = node.expression.name.getText(sourceFile);
          identifiers.add(methodName);
        } else if (ts.isIdentifier(node.expression)) {
          identifiers.add(node.expression.text);
        }
      }
      if (ts.isAwaitExpression(node)) {
        identifiers.add("async/await");
      }
      if (ts.isFunctionLike(node) && hasAsyncModifier(ts, node)) {
        identifiers.add("async/await");
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        identifiers.add(node.expression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  } else {
    const methodRegex = /\.([A-Za-z_$][\w$]*)\s*\(/g;
    let methodMatch = methodRegex.exec(code);
    while (methodMatch) {
      identifiers.add(methodMatch[1]);
      methodMatch = methodRegex.exec(code);
    }
  }

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let importMatch = importRegex.exec(code);
  while (importMatch) {
    const members = importMatch[1].split(",").map((item) => item.trim());
    const moduleName = importMatch[2];
    for (const member of members) {
      const aliasParts = member.split(/\s+as\s+/i).map((item) => item.trim());
      const original = aliasParts[0];
      const alias = aliasParts[1];
      if (moduleName.includes("lodash") && original.toLowerCase() === "debounce") {
        identifiers.add("lodash.debounce");
        identifiers.add(alias ?? original);
      }
    }
    importMatch = importRegex.exec(code);
  }

  const keywordRegex = /\b(Promise|async|await)\b/g;
  let keywordMatch = keywordRegex.exec(code);
  while (keywordMatch) {
    const token = keywordMatch[1];
    if (token === "async" || token === "await") {
      identifiers.add("async/await");
    } else {
      identifiers.add(token);
    }
    keywordMatch = keywordRegex.exec(code);
  }

  return identifiers;
}

function detectPythonIdentifiers(code: string): Set<string> {
  const identifiers = new Set<string>();
  const methodRegex = /\.([A-Za-z_][\w]*)\s*\(/g;
  let methodMatch = methodRegex.exec(code);
  while (methodMatch) {
    identifiers.add(methodMatch[1]);
    methodMatch = methodRegex.exec(code);
  }

  const keywordRegex = /\b(async|await|enumerate|range|len|map|filter|reduce)\b/g;
  let keywordMatch = keywordRegex.exec(code);
  while (keywordMatch) {
    const token = keywordMatch[1];
    if (token === "async" || token === "await") {
      identifiers.add("async/await");
    } else {
      identifiers.add(token);
    }
    keywordMatch = keywordRegex.exec(code);
  }
  return identifiers;
}

function detectJavaIdentifiers(code: string): Set<string> {
  const identifiers = new Set<string>();
  const methodRegex = /\.([A-Za-z_][\w]*)\s*\(/g;
  let methodMatch = methodRegex.exec(code);
  while (methodMatch) {
    identifiers.add(methodMatch[1]);
    methodMatch = methodRegex.exec(code);
  }

  const classRegex = /\b(Stream|CompletableFuture|Optional)\b/g;
  let classMatch = classRegex.exec(code);
  while (classMatch) {
    identifiers.add(classMatch[1]);
    classMatch = classRegex.exec(code);
  }
  return identifiers;
}

function detectGenericIdentifiers(code: string): Set<string> {
  const identifiers = new Set<string>();
  const tokenRegex = /\b([A-Za-z_$][\w$]*)\b/g;
  let tokenMatch = tokenRegex.exec(code);
  while (tokenMatch) {
    const token = tokenMatch[1];
    if (looksLikeMeaningfulToken(token)) {
      identifiers.add(token);
    }
    tokenMatch = tokenRegex.exec(code);
  }
  return identifiers;
}

async function mapIdentifiersToTutorials(
  detectedIdentifiers: Set<string>,
  language: string
): Promise<TutorialRecommendation[]> {
  const normalizedLanguage = normalizeLanguage(language);
  const identifiers = Array.from(detectedIdentifiers)
    .filter((identifier) => looksLikeMeaningfulToken(identifier))
    .slice(0, 8);
  const resolved = await Promise.all(identifiers.map(async (identifier) => {
    const dynamic = await fetchDynamicDocumentation(identifier, normalizedLanguage);
    return {
      identifier,
      language: normalizedLanguage,
      summary: dynamic?.abstract || inferIdentifierSummary(identifier, normalizedLanguage),
      sources: dedupeAndSortSources([
        ...(dynamic?.abstractUrl ? [{ name: dynamicSourceName(dynamic.abstractUrl), url: dynamic.abstractUrl }] : []),
        ...buildDefaultSources(identifier, normalizedLanguage)
      ])
    } as TutorialRecommendation;
  }));

  return resolved
    .filter((item) => item.sources.length > 0)
    .sort((a, b) => sourceRank(a.sources[0]?.name ?? "") - sourceRank(b.sources[0]?.name ?? ""))
    .slice(0, 10);
}

async function fetchDynamicDocumentation(identifier: string, language: string): Promise<TutorialRegistryEntry | undefined> {
  const query = encodeURIComponent(`${language} ${identifier} method tutorial`);
  const url = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`;
  try {
    const response = await fetchWithTimeout(url, 2500);
    if (!response || !response.ok) {
      return undefined;
    }
    const payload = await response.json() as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ FirstURL?: string; Text?: string }>;
    };

    const abstract = String(payload.AbstractText ?? "").trim();
    const abstractUrl = String(payload.AbstractURL ?? "").trim();
    if (abstract && abstractUrl) {
      return { abstract, abstractUrl };
    }

    if (Array.isArray(payload.RelatedTopics)) {
      for (const topic of payload.RelatedTopics) {
        const text = String(topic.Text ?? "").trim();
        const firstUrl = String(topic.FirstURL ?? "").trim();
        if (text && firstUrl) {
          return { abstract: text, abstractUrl: firstUrl };
        }
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function dedupeAndSortSources(sources: TutorialSource[]): TutorialSource[] {
  const deduped = new Map<string, TutorialSource>();
  for (const source of sources) {
    if (!deduped.has(source.url)) {
      deduped.set(source.url, source);
    }
  }
  return Array.from(deduped.values()).sort((a, b) => sourceRank(a.name) - sourceRank(b.name));
}

function sourceRank(name: string): number {
  const key = name.toLowerCase();
  if (key.includes("mdn") || key.includes("python docs") || key.includes("oracle") || key.includes("official")) {
    return 0;
  }
  if (key.includes("w3schools")) {
    return 1;
  }
  if (key.includes("duckduckgo")) {
    return 2;
  }
  if (key.includes("search")) {
    return 4;
  }
  return 2;
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

function hasMethodLikeMatch(detectedLower: Set<string>, key: string): boolean {
  if (detectedLower.has(key)) {
    return true;
  }
  const stripped = key.replace(/^array\.prototype\./, "");
  return detectedLower.has(stripped) || detectedLower.has(`.${stripped}`);
}

function looksLikeMeaningfulToken(token: string): boolean {
  if (!token || token.length < 3) {
    return false;
  }
  return /[A-Z_]/.test(token.slice(1)) || /[a-z][A-Z]/.test(token) || token === token.toLowerCase();
}

function inferIdentifierSummary(identifier: string, language: string): string {
  const normalized = identifier.toLowerCase();
  if (normalized.includes("map")) {
    return `The \`${identifier}\` construct is commonly used to transform values into a new collection.`;
  }
  if (normalized.includes("filter")) {
    return `The \`${identifier}\` construct is commonly used to keep only values that match a condition.`;
  }
  if (normalized.includes("reduce")) {
    return `The \`${identifier}\` construct combines multiple values into a single result.`;
  }
  if (normalized.includes("split")) {
    return `The \`${identifier}\` construct usually splits text into parts using a delimiter or pattern.`;
  }
  if (normalized.includes("match")) {
    return `The \`${identifier}\` construct usually matches text against a regex/pattern.`;
  }
  if (normalized === "atob" || normalized === "btoa") {
    return `The \`${identifier}\` construct is used for Base64 encode/decode operations in JavaScript environments.`;
  }
  if (normalized.includes("await") || normalized.includes("async")) {
    return `The \`${identifier}\` construct is part of asynchronous programming flow.`;
  }
  return `\`${identifier}\` is used in this code path. Open a tutorial link to learn its syntax, behavior, and best practices in ${language}.`;
}

function buildDefaultSources(identifier: string, language: string): TutorialSource[] {
  const encoded = encodeURIComponent(identifier);
  const langQuery = encodeURIComponent(`${language} ${identifier} tutorial`);
  const docs: TutorialSource[] = [];
  if (language === "javascript" || language === "typescript") {
    docs.push({ name: "MDN Search", url: `https://developer.mozilla.org/en-US/search?q=${encoded}` });
    docs.push({ name: "W3Schools Search", url: `https://www.w3schools.com/js/js_search.asp?search=${encoded}` });
  } else if (language === "python") {
    docs.push({ name: "Python Docs Search", url: `https://docs.python.org/3/search.html?q=${encoded}` });
    docs.push({ name: "W3Schools Python Search", url: `https://www.w3schools.com/python/python_search.asp?search=${encoded}` });
  } else if (language === "java") {
    docs.push({ name: "Oracle Java Docs", url: `https://docs.oracle.com/javase/8/docs/api/index.html?search=${encoded}` });
    docs.push({ name: "GeeksforGeeks Search", url: `https://www.geeksforgeeks.org/?s=${encodeURIComponent(`java ${identifier}`)}` });
  } else {
    docs.push({ name: "Google Search", url: `https://www.google.com/search?q=${langQuery}` });
  }
  docs.push({ name: "Google Search", url: `https://www.google.com/search?q=${langQuery}` });
  return docs;
}

function dynamicSourceName(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("developer.mozilla")) {
    return "MDN";
  }
  if (lower.includes("w3schools")) {
    return "W3Schools";
  }
  if (lower.includes("python.org")) {
    return "Python Docs";
  }
  if (lower.includes("oracle.com")) {
    return "Oracle Docs";
  }
  return "DuckDuckGo";
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
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
  isCallExpression: (node: unknown) => node is {
    expression: unknown;
  };
  isPropertyAccessExpression: (node: unknown) => node is {
    name: { getText: (sourceFile?: unknown) => string };
  };
  isIdentifier: (node: unknown) => node is {
    text: string;
  };
  isAwaitExpression: (node: unknown) => boolean;
  isFunctionLike: (node: unknown) => node is {
    modifiers?: ReadonlyArray<{ kind: number }>;
  };
  isNewExpression: (node: unknown) => node is {
    expression: unknown;
  };
}

function tryRequireTypeScript(): TypeScriptLike | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require("typescript") as TypeScriptLike;
  } catch {
    return undefined;
  }
}
