import { KycInteractionContext } from "./interactionContext";

export type KycActionId =
  | "explainSelectedCode"
  | "explainLineByLine"
  | "summarizeSelection"
  | "findIssues"
  | "optimizeFunction";

export interface ContextActionDefinition {
  id: string;
  title: string;
  command: string;
  args?: unknown[];
  description: string;
}

export function getAvailableActions(context: KycInteractionContext): ContextActionDefinition[] {
  if (context.mode === "selection") {
    const genericSelectionActions: ContextActionDefinition[] = [
      createGenericAction("explainSelectedCode", "Explain Selected Code", "Explain exactly the selected code."),
      createGenericAction("explainLineByLine", "Explain Line-by-Line", "Explain each selected line in order."),
      createGenericAction("summarizeSelection", "Summarize Selection", "Summarize the selected code block."),
      createGenericAction("findIssues", "Find Issues / Improvements", "Review the selection for bugs and improvements.")
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
        createGenericAction("optimizeFunction", "Optimize Function", "Suggest optimizations for this function."),
        ...genericSelectionActions
      ];
    }

    return genericSelectionActions;
  }

  return [
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
    {
      id: "findDependencies",
      title: "Find Dependencies",
      command: "knowYourCode.showConnectedCalls",
      description: "Show callers, callees, and dependencies."
    },
    createGenericAction("optimizeFunction", "Optimize Function", "Suggest optimizations for the current function.")
  ];
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
  }
}
