import { detectBackendApiContext } from "../core/apiRequestDetection";
import { KycInteractionContext } from "./interactionContext";

export type KycActionId =
  | "explainSelectedCode"
  | "explainLineByLine"
  | "summarizeSelection"
  | "findIssues"
  | "optimizeFunction"
  | "generateApiCurl";

export interface ContextActionDefinition {
  id: string;
  title: string;
  command: string;
  args?: unknown[];
  description: string;
}

const GENERATE_CURL_ACTION: ContextActionDefinition = {
  id: "generateApiCurl",
  title: "Generate cURL",
  command: "knowYourCode.generateApiCurl",
  description: "Generate backend API request in cURL."
};

function shouldOfferGenerateApiCurl(context: KycInteractionContext): boolean {
  return detectBackendApiContext(context, "generateApiCurl").backendOnlyEligible;
}

export function getAvailableActions(context: KycInteractionContext, cursorHandoff = false): ContextActionDefinition[] {
  const curlIfApi = shouldOfferGenerateApiCurl(context) ? [GENERATE_CURL_ACTION] : [];

  if (context.mode === "selection") {
    const genericSelectionActions: ContextActionDefinition[] = [
      createGenericAction("explainSelectedCode", "Explain Selected Code", "Explain exactly the selected code."),
    ];

    if (context.selectionKind === "fullFunction") {
      return [
        {
          id: "explainFunction",
          title: "Explain Function",
          command: "knowYourCode.explainFunction",
          description: "Explain the full function."
        },
        {
          id: "explainCallFlow",
          title: "Explain Call Flow",
          command: "knowYourCode.explainCallFlow",
          description: "Trace the function call flow."
        },
        {
          id: "findDependencies",
          title: "Find Dependencies",
          command: "knowYourCode.showConnectedCalls",
          description: "Show callers, callees, and dependencies."
        },
        ...curlIfApi,
        ...genericSelectionActions
      ];
    }

    return genericSelectionActions;
  }

  // Cursor mode — same inline entry points as a full-function selection (minus dependency graph).
  const cursorActions: ContextActionDefinition[] = [
    {
      id: "explainFunction",
      title: "Explain Function",
      command: "knowYourCode.explainFunction",
      description: "Explain the current function."
    },
    {
      id: "explainCallFlow",
      title: "Explain Call Flow",
      command: "knowYourCode.explainCallFlow",
      description: "Trace the function call flow."
    },
    ...curlIfApi
  ];

  return cursorActions;
}

function createGenericAction(id: KycActionId, title: string, description: string): ContextActionDefinition {
  return {
    id,
    title,
    command: "knowYourCode.runContextAction",
    args: [id],
    description
  };
}

export function buildContextActionPrompt(actionId: KycActionId, context: KycInteractionContext): string {
  const scopeLabel = context.mode === "selection"
    ? `Selected ${context.selectionKind ?? context.scope}`
    : `Current ${context.scope}`;

  const promptHeader = [
    "You are Know Your Code, an expert code intelligence assistant inside VS Code.",
    "Respond in concise, developer-friendly markdown.",
    "Respect the provided scope exactly. Do not assume code outside the selection unless explicitly included in the context.",
    "",
    `Action: ${actionId}`,
    `Scope: ${scopeLabel}`,
    `File: ${context.filePath}`,
    `Language: ${context.language}`,
    context.symbolContext ? `Symbol: ${context.symbolContext.symbolName}` : "",
    ""
  ].filter(Boolean).join("\n");

  const body = [
    promptHeader,
    actionInstructions(actionId),
    "",
    "Code:",
    "```",
    context.code,
    "```"
  ];

  if (context.symbolContext) {
    body.push(
      "",
      "Related context:",
      `- Callers: ${context.symbolContext.callers.map((item) => item.name).join(", ") || "none"}`,
      `- Callees: ${context.symbolContext.callees.map((item) => item.name).join(", ") || "none"}`,
      `- Imports: ${context.symbolContext.imports.join(", ") || "none"}`
    );
  }

  return body.join("\n");
}

function actionInstructions(actionId: KycActionId): string {
  switch (actionId) {
    case "explainSelectedCode":
      return [
        "Goal:",
        "- Explain the selected code deeply but clearly.",
        "- Include purpose, why it exists, and key logic.",
        "- If the selection is partial, do not expand beyond what is visible unless clearly inferable."
      ].join("\n");
    case "explainLineByLine":
      return [
        "Goal:",
        "- Explain the selected code line-by-line in markdown.",
        "- Use a numbered list, one entry per logical line or small group.",
        "- Keep explanations precise and beginner-friendly."
      ].join("\n");
    case "summarizeSelection":
      return [
        "Goal:",
        "- Summarize the selection in 3 sections: purpose, main flow, and important dependencies.",
        "- Keep it brief and skimmable."
      ].join("\n");
    case "findIssues":
      return [
        "Goal:",
        "- Review the selected code for correctness, maintainability, readability, and performance issues.",
        "- Prefer concrete findings over generic advice.",
        "- Include suggested fixes."
      ].join("\n");
    case "optimizeFunction":
      return [
        "Goal:",
        "- Analyze the code for optimization opportunities.",
        "- Cover performance, readability, maintainability, and API usage.",
        "- Provide practical refactoring suggestions with trade-offs."
      ].join("\n");
    case "generateApiCurl":
      return buildApiRequestInstructions();
  }
}

function buildApiRequestInstructions(): string {
  return [
    "Goal:",
    "- Generate an equivalent cURL request from the provided BACKEND code only.",
    "- If the snippet is not backend API-related, respond with exactly: BACKEND_API_NOT_DETECTED",
    "- Extract and preserve: HTTP method, full URL, headers, auth, params, body, and path params.",
    "- Put a single absolute URL in the first curl argument (scheme + host + path + query when inferable).",
    "- When \"Detected API metadata\" includes \"Inferred request URL\", use that exact string as the curl URL unless the code contradicts it.",
    "- If host/base is not present in code, default to localhost (prefer `http://localhost:3000` + inferred path) instead of {{BASE_URL}}.",
    "- Prefer literals from the code over generic placeholders; use placeholders only for secrets or values not in the snippet (for example {{TOKEN}}, {{BASE_URL}}).",
    "- Do not invent endpoints or payload fields that are not inferable.",
    "- Generate only one cURL example.",
    "",
    "Output format (verbose, copy-paste friendly):",
    "- Use one markdown section named cURL and one fenced bash or plain code block.",
    "- Multi-line curl with trailing ` \\` on each continued line.",
    "- First line shape: `curl 'https://host.example/path?query' \\` (or `curl -X METHOD ...` when not GET).",
    "- One header per line: `  -H 'name: value' \\` for every header implied by the code (string literals, config objects, route middleware).",
    "- For JSON bodies use `--data-raw '{...}'` as a single line (escaped quotes inside as needed).",
    "- Do not fabricate browser-only headers (sec-ch-ua, sec-fetch-*, user-agent, etc.) unless they appear in the selection.",
    "- Add a final Notes section listing any placeholders or assumptions."
  ].join("\n");
}
