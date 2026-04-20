import * as vscode from "vscode";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { ExplanationPanel } from "../ui/panel";
import { buildContextActionPrompt, KycActionId } from "../context/actionRegistry";
import { KycInteractionContext, resolveInteractionContext } from "../context/interactionContext";
import { formatProviderError } from "../core/providerErrors";
import { LastActionRunner, RerunIntent } from "../core/lastAction";
import { ModelSelectionService } from "../providers/modelSelector";
import { SelectedModel } from "../core/types";
import { normalizeExplanationResult } from "../providers/normalizeExplanation";
import { formatExplanationMarkdown } from "../ui/formatter";
import { sanitizeForDisplay } from "../core/responseParser";
import { buildCodeReferenceMapForDocument } from "../core/codeReferences";
import { getTutorialRecommendations } from "../tutorials/recommendations";
import { ActiveRequestManager, isAbortError } from "../core/activeRequest";
import { tryReuseFunctionCache } from "../core/cacheReuse";
import {
  buildApiMetadataSummary,
  detectBackendApiContext,
  isApiGenerationAction
} from "../core/apiRequestDetection";

export function createRunContextActionCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel,
  activeRequestManager: ActiveRequestManager,
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

    const apiDetection = detectBackendApiContext(context, actionId);

    const { isCursorHandoffEnabled } = await import("../cursor/handoff");
    if (isCursorHandoffEnabled()) {
      if (apiDetection.isApiAction && !apiDetection.backendOnlyEligible) {
        void vscode.window.showWarningMessage(apiDetection.reason ?? "Backend API context required.");
        panel.show(
          `KYC: ${actionLabel(actionId)} (unsupported)`,
          "# Backend API context required\n\nNo backend API context detected. This feature currently supports backend code only.",
          { cacheHit: false }
        );
        return;
      }
      const { handoffToCursorChat } = await import("../cursor/handoff");
      const { buildCursorContextActionPrompt } = await import("../cursor/promptAssembler");
      let cursorPrompt = buildCursorContextActionPrompt(actionId, context);
      if (apiDetection.isApiAction && apiDetection.backendOnlyEligible) {
        cursorPrompt += `\n\nDetected API metadata:\n${buildApiMetadataSummary(apiDetection)}`;
      }
      await handoffToCursorChat(cursorPrompt, actionLabel(actionId));
      return;
    }

    const prompt = buildContextActionPrompt(actionId, context);
    if (apiDetection.isApiAction && !apiDetection.backendOnlyEligible) {
      void vscode.window.showWarningMessage(apiDetection.reason ?? "Backend API context required.");
      panel.show(
        `KYC: ${actionLabel(actionId)} (unsupported)`,
        "# Backend API context required\n\nNo backend API context detected. This feature currently supports backend code only.",
        { cacheHit: false }
      );
      return;
    }

    const enrichedPrompt = apiDetection.isApiAction
      ? `${prompt}\n\nDetected API metadata:\n${buildApiMetadataSummary(apiDetection)}`
      : prompt;
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
        await runAction(context, enrichedPrompt, actionId, rerunSelection, true);
      }
    });

    await runAction(context, enrichedPrompt, actionId, selection, options?.forceRefresh === true);
  };

  async function runAction(
    context: KycInteractionContext,
    prompt: string,
    actionId: KycActionId,
    selection: SelectedModel,
    forceRefresh: boolean
  ): Promise<void> {
    const activeRequest = activeRequestManager.start(selection.modelName);
    void vscode.commands.executeCommand("setContext", "knowYourCode.isGenerating", true);
    panel.showLoading(`KYC: ${actionLabel(actionId)}`, selection.providerLabel, selection.modelName, {
      requestId: activeRequest.requestId,
      stoppable: true
    });
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: ${actionLabel(actionId)}...`,
        cancellable: false
      },
      async () => {
        try {
          if (actionId === "explainSelectedCode" && !forceRefresh && context.enclosingFunction) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
              const reused = tryReuseFunctionCache(
                orchestrator,
                context.enclosingFunction,
                {
                  startLine: editor.selection.start.line + 1,
                  endLine: editor.selection.end.line + 1
                },
                context.code
              );
              if (reused) {
                const reusedTutorials = await getTutorialRecommendations(context.code, context.language, {
                  enclosingFunctionCode: context.enclosingFunction?.code
                });
                panel.show(
                  `KYC: ${actionLabel(actionId)} (from ${reused.functionName} cache)`,
                  reused.markdown,
                  {
                    provider: reused.meta.providerLabel,
                    modelName: reused.meta.modelName,
                    cacheHit: true,
                    cacheLabel: reused.meta.cacheLabel,
                    references: await resolveReferencesForCurrentEditor(reused.markdown, context),
                    tutorials: reusedTutorials.tutorials,
                    tutorialsCached: reusedTutorials.fromCache
                  }
                );
                return;
              }
            }
          }

          const { result, meta } = await orchestrator.runContextAction({
            actionId,
            key: context.key,
            contentHash: context.contentHash,
            dependencyHash: context.dependencyHash,
            prompt,
            selection
          }, { forceRefresh, signal: activeRequest.controller.signal });

          let renderedMarkdown = renderPossiblyJsonExplanation(result.markdown);

          const actionTutorials = await getTutorialRecommendations(context.code, context.language, {
            enclosingFunctionCode: context.enclosingFunction?.code
          });
          panel.show(
            `KYC: ${actionLabel(actionId)}`,
            postProcessApiMarkdown(actionId, renderedMarkdown),
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel,
              references: await resolveReferencesForCurrentEditor(
                renderedMarkdown,
                context
              ),
              tutorials: actionTutorials.tutorials,
              tutorialsCached: actionTutorials.fromCache,
              tokenUsage: meta.tokenUsage
            }
          );
        } catch (error) {
          if (activeRequest.controller.signal.aborted || isAbortError(error)) {
            panel.showStopped(`KYC: ${actionLabel(actionId)}`, selection.providerLabel, selection.modelName);
            return;
          }
          const friendly = formatProviderError(error, selection.provider);
          panel.show(
            `KYC: ${actionLabel(actionId)} (error)`,
            `# ${actionLabel(actionId)}\n\n${friendly}`,
            { provider: selection.providerLabel, modelName: selection.modelName, cacheHit: false }
          );
          void vscode.window.showWarningMessage(friendly);
        } finally {
          activeRequestManager.complete(activeRequest.requestId);
          void vscode.commands.executeCommand("setContext", "knowYourCode.isGenerating", activeRequestManager.hasActive());
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

  const normalized = normalizeExplanationResult(raw);
  if (normalized.confidence > 0.3 || normalized.stepByStep.length > 0) {
    return formatExplanationMarkdown(normalized);
  }

  if (looksLikeGarbledJson(raw)) {
    const cleaned = sanitizeForDisplay(raw);
    if (cleaned && cleaned !== raw) {
      return `# Explanation\n\n${cleaned}`;
    }
  }

  return raw;
}

function looksLikeGarbledJson(text: string): boolean {
  return /&quot;|&amp;|&lt;/.test(text) ||
    /[{}\[\]]/.test(text) && /"?\w+"?\s*:/.test(text);
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
    case "generateApiCurl":
      return "Generate cURL";
  }
}

function postProcessApiMarkdown(actionId: KycActionId, markdown: string): string {
  if (!isApiGenerationAction(actionId)) {
    return markdown;
  }
  if (markdown.includes("BACKEND_API_NOT_DETECTED")) {
    return "# Backend API context required\n\nNo backend API context detected. This feature currently supports backend code only.";
  }
  return markdown;
}
