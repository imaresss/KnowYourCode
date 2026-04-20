import { KycInteractionContext } from "../context/interactionContext";

const API_ACTION_IDS = new Set<string>(["generateApiCurl"]);

const BACKEND_LANGUAGE_IDS = new Set([
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
  "python",
  "java",
  "php",
  "go",
  "csharp",
  "swift",
  "kotlin",
  "ruby",
  "rust",
  "scala",
  "clojure",
  "elixir",
  "erlang",
  "perl",
  "dart",
  "fsharp",
  "vb"
]);

const BACKEND_PATH_HINT = /(server|backend|api|controller|controllers|service|services|routes|router|handlers?)/i;
const FRONTEND_PATH_HINT = /(frontend|client|ui|components|pages|views|hooks|store)/i;

/**
 * HTTP route / handler / outbound HTTP client signals in the **current snippet only**.
 * File path is not enough — avoids showing Generate cURL on arbitrary helpers inside route folders.
 */
const API_SURFACE_HINTS = [
  /\b(express|fastify|koa|hapi|nestjs|sails|restify|polka)\b/i,
  /\b(app|router|route|routes)\.(get|post|put|patch|delete|all|options|head|use)\s*\(/i,
  /\brouter\.(get|post|put|patch|delete|all|use)\s*\(/i,
  /@\s*(Controller|Get|Post|Put|Patch|Delete|RequestMapping|ResponseBody|RestController|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)\b/,
  /\bRoute::(get|post|put|patch|delete|match|any|resource)\b/i,
  /\bRoute::(get|post|put|patch|delete)\s*\(\s*["'`]/i,
  /@app\.route\s*\(/i,
  /@\w+\.(get|post|put|patch|delete)\s*\(\s*["'`]/i,
  /\bpath\s*\(\s*["'`]/,
  /\b(re_path|url)\s*\(\s*["'`]/,
  /\burlpatterns\b/,
  /\bhttp\.(HandleFunc|Handle|ListenAndServe|Get|Post|Head)\b/,
  /\bHandleFunc\s*\(/,
  /\w+\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*["'`]/,
  /\b(mux|goji)\.(Handle|HandleFunc|Methods|PathPrefix)/i,
  /\b(chi)\.(Get|Post|Put|Patch|Delete|Route)\s*\(/i,
  /\b(actix_web|axum::|Router::new|web::resource|rocket::)/i,
  /\b(routing|route)\s*\{/i,
  /\b(get|post|put|patch|delete)\s+["'`]\/[\w\-{}:]/i,
  /\bscope\s+["'`]\//i,
  /\b(pipe|forward)\s+.*\b(get|post)\s+["'`]\//i,
  /\b@Path\s*\(\s*["'`]/i,
  /\b@ApplicationPath\b|\b@Provider\b.*\bjax\.rs\b/i,
  /\b(Server|createServer)\s*\(/i,
  /\b(req|request)\.(params|query|body|headers|cookies)\b/i,
  /\bres\.(json|send|status|redirect|end|cookie)\s*\(/i,
  /\b(req|request|res)\s*:\s*(Request|Response|IncomingMessage|ServerResponse)\b/i,
  /\bctx\.(body|request|response|set|status)\b/i,
  /\b(c|this)\.(Get|Post|Put|Patch|Delete)\s*\(\s*["'`]/i,
  /\bHttpClient\b|\bOkHttpClient\b|WebClient\b|RestTemplate\b/i,
  /\baxios\.(get|post|put|patch|delete)\s*\(/i,
  /\bfetch\s*\(/,
  /\brequests\.(get|post|put|patch|delete)\s*\(/i,
  /\bcurl_init\s*\(/i,
  /\b(HTTParty|Faraday|Excon)\b.*\.(get|post|put|patch|delete)\s*\(/i,
  /\bNet::HTTP\b/,
  /\bhttp\.(get|request)\s*\(/i,
  /\burllib\.request\b|\bhttpx\.(get|post|put|patch|delete)\s*\(/i,
  /\b[aA]iohttp\.(ClientSession|get|post)\b/,
  /\b(shelf|shelf_router|shelf_io)\./i,
  /\bhttp\.Server\b|\bHttpServer\b/i
];

const FRONTEND_CODE_HINTS = [
  /\b(useEffect|useState|useMemo|useCallback|createSlice|useQuery|useMutation)\b/,
  /<\w+[\s>]/,
  /\bwindow\./,
  /\bdocument\./
];

export interface ApiDetectionResult {
  isApiAction: boolean;
  backendOnlyEligible: boolean;
  reason?: string;
  metadata: {
    method?: string;
    endpoint?: string;
    baseUrl?: string;
    envVars: string[];
    headers: string[];
    hasAuthHeader: boolean;
    hasBody: boolean;
    hasQueryParams: boolean;
    bodyType: "json" | "multipart" | "form-urlencoded" | "unknown" | "none";
  };
}

export function isApiGenerationAction(actionId: string): boolean {
  return API_ACTION_IDS.has(actionId);
}

export function detectBackendApiContext(context: KycInteractionContext, actionId: string): ApiDetectionResult {
  const code = context.code ?? "";
  const filePath = context.filePath ?? "";
  const languageOk = BACKEND_LANGUAGE_IDS.has(context.language);

  const backendPathScore = BACKEND_PATH_HINT.test(filePath) ? 1 : 0;
  const frontendPathScore = FRONTEND_PATH_HINT.test(filePath) ? 1 : 0;
  const apiSurfaceScore = API_SURFACE_HINTS.reduce((acc, rx) => acc + (rx.test(code) ? 1 : 0), 0);
  const frontendCodeScore = FRONTEND_CODE_HINTS.reduce((acc, rx) => acc + (rx.test(code) ? 1 : 0), 0);

  const frontendDominated =
    frontendCodeScore > apiSurfaceScore && frontendPathScore >= backendPathScore;

  const backendOnlyEligible = languageOk && apiSurfaceScore > 0 && !frontendDominated;

  return {
    isApiAction: isApiGenerationAction(actionId),
    backendOnlyEligible,
    reason: backendOnlyEligible
      ? undefined
      : "No backend API context detected. This feature supports backend code only.",
    metadata: {
      method: detectHttpMethod(code),
      endpoint: detectEndpoint(code),
      baseUrl: detectBaseUrl(code),
      envVars: extractEnvVars(code),
      headers: extractHeaderKeys(code),
      hasAuthHeader: /\b(authorization|x-api-key|bearer)\b/i.test(code),
      hasBody: /\b(body|data|payload|json|stringify)\b/i.test(code),
      hasQueryParams: /(\?|params\s*:|searchParams)/i.test(code),
      bodyType: detectBodyType(code)
    }
  };
}

export function resolveInferredRequestUrl(metadata: ApiDetectionResult["metadata"]): string | undefined {
  const ep = metadata.endpoint?.trim();
  const base = metadata.baseUrl?.trim();
  if (ep && /^https?:\/\//i.test(ep)) {
    return ep;
  }
  if (base && /^https?:\/\//i.test(base)) {
    const origin = base.replace(/\/+$/, "");
    if (!ep) {
      return origin;
    }
    if (ep.startsWith("/")) {
      return `${origin}${ep}`;
    }
    return `${origin}/${ep}`;
  }
  if (base && ep?.startsWith("/")) {
    const prefix = base.replace(/\/+$/, "");
    return `${prefix}${ep}`;
  }
  if (ep?.startsWith("/")) {
    return `http://localhost:3000${ep}`;
  }
  return undefined;
}

export function buildApiMetadataSummary(result: ApiDetectionResult): string {
  const metadata = result.metadata;
  const inferredUrl = resolveInferredRequestUrl(metadata);
  const bits = [
    `- Method: ${metadata.method ?? "unknown"}`,
    `- Endpoint: ${metadata.endpoint ?? "unknown"}`,
    `- Base URL: ${metadata.baseUrl ?? "unknown"}`,
    inferredUrl ? `- Inferred request URL (use this on the curl line when host+path are from literals): ${inferredUrl}` : "",
    `- Auth header detected: ${metadata.hasAuthHeader ? "yes" : "no"}`,
    `- Query params detected: ${metadata.hasQueryParams ? "yes" : "no"}`,
    `- Body detected: ${metadata.hasBody ? `yes (${metadata.bodyType})` : "no"}`
  ].filter(Boolean) as string[];

  if (metadata.headers.length > 0) {
    bits.push(`- Header keys: ${metadata.headers.join(", ")}`);
  }
  if (metadata.envVars.length > 0) {
    bits.push(`- Env vars: ${metadata.envVars.join(", ")}`);
  }
  return bits.join("\n");
}

function detectHttpMethod(code: string): string | undefined {
  const methodMatch = code.match(/\b(get|post|put|patch|delete|options|head)\b/i);
  if (methodMatch?.[1]) {
    return methodMatch[1].toUpperCase();
  }
  const fetchMethod = code.match(/method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)["'`]/i);
  return fetchMethod?.[1]?.toUpperCase();
}

function detectEndpoint(code: string): string | undefined {
  const quotedPath = code.match(/["'`](\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%{}]*)["'`]/);
  if (quotedPath?.[1]) {
    return quotedPath[1];
  }
  const quotedUrl = code.match(/["'`](https?:\/\/[^"'`\s]+)["'`]/i);
  if (quotedUrl?.[1]) {
    return quotedUrl[1];
  }
  return undefined;
}

function detectBaseUrl(code: string): string | undefined {
  const direct = code.match(/["'`](https?:\/\/[^"'`\s/]+(?:\/[^"'`\s]*)?)["'`]/i);
  if (direct?.[1]) {
    return direct[1];
  }
  const envStyle = code.match(/process\.env\.([A-Z0-9_]+)/);
  if (envStyle?.[1]) {
    return `{{${envStyle[1]}}}`;
  }
  return undefined;
}

function extractEnvVars(code: string): string[] {
  const vars = new Set<string>();
  for (const match of code.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    if (match[1]) {
      vars.add(match[1]);
    }
  }
  return [...vars];
}

function extractHeaderKeys(code: string): string[] {
  const headers = new Set<string>();
  for (const match of code.matchAll(/\b([A-Za-z-]+)\s*:\s*["'`]/g)) {
    const key = match[1];
    if (/authorization|content-type|accept|x-/i.test(key)) {
      headers.add(key);
    }
  }
  return [...headers];
}

function detectBodyType(code: string): "json" | "multipart" | "form-urlencoded" | "unknown" | "none" {
  if (!/\b(body|data|payload|FormData|multipart|urlencoded|stringify)\b/i.test(code)) {
    return "none";
  }
  if (/\bFormData\b|multipart\/form-data/i.test(code)) {
    return "multipart";
  }
  if (/application\/x-www-form-urlencoded|URLSearchParams/i.test(code)) {
    return "form-urlencoded";
  }
  if (/application\/json|JSON\.stringify|\{[\s\S]*\}/i.test(code)) {
    return "json";
  }
  return "unknown";
}
