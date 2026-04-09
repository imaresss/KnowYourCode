import * as vscode from "vscode";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { ExplanationPanel } from "../ui/panel";
import { buildContextActionPrompt, KycActionId } from "../context/actionRegistry";
import { KycInteractionContext, resolveInteractionContext } from "../context/interactionContext";
import { formatProviderError } from "../core/providerErrors";
import { LastActionRunner, RerunIntent } from "../core/lastAction";
import { ModelSelectionService } from "../providers/modelSelector";
import { SelectedModel } from "../core/types";
import { normalizeExplanationResult, parseJsonObjectFromModelText } from "../providers/normalizeExplanation";
import { formatExplanationMarkdown, formatLineExplanationMarkdown } from "../ui/formatter";
import { buildCodeReferenceMapForDocument } from "../core/codeReferences";
import { getTutorialRecommendations } from "../tutorials/recommendations";

export function createRunContextActionCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel,
  setLastActionRunner: (runner: LastActionRunner | undefined) => void
) {
  return async (
    actionId: KycActionId,
    options?: { forceRefresh?: boolean; selectionOverride?: SelectedModel }
  ) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to use KYC actions.");
      return;
    }

    const context = await resolveInteractionContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No valid KYC context was found at the current cursor or selection.");
      return;
    }

    const prompt = buildContextActionPrompt(actionId, context);
    const selection = options?.selectionOverride ?? await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model for ${actionLabel(actionId)}`
    });
    if (!selection) {
      return;
    }

    setLastActionRunner({
      rerun: async (intent: RerunIntent) => {
        const rerunSelection = intent === "switchModel"
          ? await modelSelector.pickModel({
            title: "KYC: Switch AI Model",
            placeHolder: `Choose a default model for ${actionLabel(actionId)}`,
            forcePrompt: true,
            persistAsDefault: true
          })
          : selection;
        if (!rerunSelection) {
          return;
        }
        await runAction(context, prompt, actionId, rerunSelection, true);
      }
    });

    await runAction(context, prompt, actionId, selection, options?.forceRefresh === true);
  };

  async function runAction(
    context: KycInteractionContext,
    prompt: string,
    actionId: KycActionId,
    selection: SelectedModel,
    forceRefresh: boolean
  ): Promise<void> {
    if (
      !forceRefresh &&
      actionId === "explainSelectedCode" &&
      context.enclosingFunctionName &&
      context.enclosingCode &&
      context.selectionStartLine != null &&
      context.selectionEndLine != null
    ) {
      const derived = orchestrator.tryDeriveForSelection(
        context.filePath,
        context.enclosingFunctionName,
        context.enclosingCode,
        context.selectionStartLine,
        context.selectionEndLine
      );
      if (derived) {
        const lineLabel = context.selectionStartLine === context.selectionEndLine
          ? `Line ${context.selectionStartLine}`
          : `Lines ${context.selectionStartLine}-${context.selectionEndLine}`;
        const markdown = formatLineExplanationMarkdown(
          derived.result,
          context.code,
          context.selectionStartLine,
          derived.functionName
        );
        const editor = vscode.window.activeTextEditor;
        const references = editor
          ? await buildCodeReferenceMapForDocument(markdown, editor.document, {
            focusedRange: editor.selection,
            seedIdentifiers: [derived.functionName]
          })
          : [];
        panel.show(
          `KYC: ${lineLabel} (derived)`,
          markdown,
          {
            provider: derived.meta.providerLabel,
            modelName: derived.meta.modelName,
            cacheHit: false,
            cacheLabel: "Derived",
            references,
            tutorials: await getTutorialRecommendations(context.code, context.language),
            tokenUsage: derived.meta.tokenUsage,
            derived: true,
            derivedFromFunction: derived.functionName
          }
        );
        return;
      }
    }

    panel.showLoading(`KYC: ${actionLabel(actionId)}`, selection.providerLabel, selection.modelName);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: ${actionLabel(actionId)}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.runContextAction({
            actionId,
            key: context.key,
            contentHash: context.contentHash,
            dependencyHash: context.dependencyHash,
            prompt,
            selection
          }, { forceRefresh });
          const renderedMarkdown = renderPossiblyJsonExplanation(result.markdown);

          panel.show(
            `KYC: ${actionLabel(actionId)}`,
            renderedMarkdown,
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel,
              references: await resolveReferencesForCurrentEditor(
                renderedMarkdown,
                context
              ),
              tutorials: await getTutorialRecommendations(context.code, context.language),
              tokenUsage: meta.tokenUsage
            }
          );
        } catch (error) {
          const friendly = formatProviderError(error, selection.provider);
          panel.show(
            `KYC: ${actionLabel(actionId)} (error)`,
            `# ${actionLabel(actionId)}\n\n${friendly}`,
            { provider: selection.providerLabel, modelName: selection.modelName, cacheHit: false }
          );
          void vscode.window.showWarningMessage(friendly);
        }
      }
    );
  }
}

async function resolveReferencesForCurrentEditor(
  markdown: string,
  context: KycInteractionContext
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return [];
  }
  const seedIdentifiers = context.symbolContext
    ? [
      context.symbolContext.symbolName,
      ...context.symbolContext.callers.map((item) => item.name),
      ...context.symbolContext.callees.map((item) => item.name),
      ...context.symbolContext.nearbySymbols.map((item) => item.name)
    ]
    : [];
  return buildCodeReferenceMapForDocument(markdown, editor.document, {
    focusedRange: editor.selection,
    seedIdentifiers
  });
}

function renderPossiblyJsonExplanation(markdownOrJson: string): string {
  const raw = String(markdownOrJson ?? "").trim();
  if (!raw) {
    return raw;
  }

  // If the model returned an explain-function shaped JSON object, render it using the standard formatter.
  const parsed = parseJsonObjectFromModelText<Record<string, unknown>>(raw);
  if (parsed && (("summary" in parsed) || ("purpose" in parsed) || ("stepByStep" in parsed))) {
    const normalized = normalizeExplanationResult(parsed);
    return formatExplanationMarkdown(normalized);
  }

  return raw;
}

function actionLabel(actionId: KycActionId): string {
  switch (actionId) {
    case "explainSelectedCode":
      return "Explain Selected Code";
    case "explainLineByLine":
      return "Explain Line-by-Line";
    case "summarizeSelection":
      return "Summarize Selection";
    case "findIssues":
      return "Find Issues / Improvements";
    case "optimizeFunction":
      return "Optimize Function";
  }
}
