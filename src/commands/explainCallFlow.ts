import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { buildContentHash, buildDependencyHash } from "../intelligence/fingerprint";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { LastActionRunner, RerunIntent } from "../core/lastAction";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { formatCallFlowMarkdown, formatExplanationMarkdown } from "../ui/formatter";
import { ExplainCallFlowInput, SelectedModel } from "../core/types";
import { buildCodeReferenceMapForDocument } from "../core/codeReferences";
import { getTutorialRecommendations } from "../tutorials/recommendations";
import { ActiveRequestManager, isAbortError } from "../core/activeRequest";

export function createExplainCallFlowCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel,
  activeRequestManager: ActiveRequestManager,
  setLastActionRunner: (runner: LastActionRunner | undefined) => void
) {
  return async (options?: { forceRefresh?: boolean; selectionOverride?: SelectedModel }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to explain the call flow.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No enclosing function or symbol was found at the current cursor.");
      return;
    }

    const { isCursorHandoffEnabled } = await import("../cursor/handoff");
    if (isCursorHandoffEnabled()) {
      const { handoffToCursorChat } = await import("../cursor/handoff");
      const { buildCursorExplainCallFlowPrompt } = await import("../cursor/promptAssembler");
      const prompt = buildCursorExplainCallFlowPrompt(context);
      await handoffToCursorChat(prompt, `Call Flow — ${context.symbolName}`);
      return;
    }

    const input: ExplainCallFlowInput = {
      workspaceRoot: context.workspaceRoot,
      filePath: context.filePath,
      language: context.language,
      symbolName: context.symbolName,
      symbolKind: context.symbolKind,
      code: context.code,
      callers: context.callers,
      callees: context.callees,
      contentHash: buildContentHash(context),
      dependencyHash: buildDependencyHash(context)
    };
    const selection = options?.selectionOverride ?? await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model to analyze ${context.symbolName}`
    });
    if (!selection) {
      return;
    }

    setLastActionRunner({
      rerun: async (intent: RerunIntent) => {
        const rerunSelection = intent === "switchModel"
          ? await modelSelector.pickModel({
            title: "KYC: Switch AI Model",
            placeHolder: `Choose a default model to re-analyze ${context.symbolName}`,
            forcePrompt: true,
            persistAsDefault: true
          })
          : selection;
        if (!rerunSelection) {
          return;
        }
        await vscode.commands.executeCommand("knowYourCode.explainCallFlow", {
          forceRefresh: true,
          selectionOverride: rerunSelection
        });
      }
    });

    const activeRequest = activeRequestManager.start(selection.modelName);
    void vscode.commands.executeCommand("setContext", "knowYourCode.isGenerating", true);
    panel.showLoading(
      `KYC: Call Flow — ${context.symbolName}`,
      selection.providerLabel,
      selection.modelName,
      { requestId: activeRequest.requestId, stoppable: true }
    );

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: Analyzing call flow for ${context.symbolName}...`,
        cancellable: false
      },
      async () => {
        try {
          const { result, meta } = await orchestrator.explainCallFlow(input, selection, {
            forceRefresh: options?.forceRefresh,
            signal: activeRequest.controller.signal
          });
          const markdown = formatCallFlowMarkdown(result, context.symbolName);
          const tutorialResult = await getTutorialRecommendations(context.code, context.language);
          const references = await buildCodeReferenceMapForDocument(markdown, editor.document, {
            focusedRange: editor.selection,
            seedIdentifiers: [
              context.symbolName,
              ...context.callers.map((item) => item.name),
              ...context.callees.map((item) => item.name)
            ]
          });
          panel.show(
            `KYC: Call Flow — ${context.symbolName}${meta.cacheHit ? " (cached)" : ""}`,
            markdown,
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel,
              references,
              tutorials: tutorialResult.tutorials,
              tutorialsCached: tutorialResult.fromCache,
              tokenUsage: meta.tokenUsage
            }
          );
        } catch (error) {
          if (activeRequest.controller.signal.aborted || isAbortError(error)) {
            panel.showStopped(`KYC: Call Flow — ${context.symbolName}`, selection.providerLabel, selection.modelName);
            return;
          }
          const friendly = formatProviderError(error, selection.provider);
          const fallback = buildFallbackExplanation(context, friendly);
          panel.show(
            `KYC: ${context.symbolName} (fallback)`,
            formatExplanationMarkdown(fallback),
            { provider: selection.providerLabel, modelName: selection.modelName, cacheHit: false }
          );
          void vscode.window.showWarningMessage(friendly);
        } finally {
          activeRequestManager.complete(activeRequest.requestId);
          void vscode.commands.executeCommand("setContext", "knowYourCode.isGenerating", activeRequestManager.hasActive());
        }
      }
    );
  };
}
