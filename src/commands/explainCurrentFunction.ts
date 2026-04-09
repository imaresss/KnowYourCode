import * as vscode from "vscode";
import { buildFallbackExplanation } from "../core/fallbackExplanation";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { LastActionRunner, RerunIntent } from "../core/lastAction";
import { SelectedModel } from "../core/types";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { formatExplanationMarkdown, formatHierarchicalExplanationMarkdown, CallGraphContext } from "../ui/formatter";
import { buildCodeReferenceMapForDocument } from "../core/codeReferences";
import { getTutorialRecommendations } from "../tutorials/recommendations";
import { ActiveRequestManager, isAbortError } from "../core/activeRequest";
import { explainFunctionHierarchical } from "../core/hierarchicalExplain";

export function createExplainCurrentFunctionCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel,
  activeRequestManager: ActiveRequestManager,
  setLastActionRunner: (runner: LastActionRunner | undefined) => void
) {
  return async (options?: { forceRefresh?: boolean; selectionOverride?: SelectedModel }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to explain the current function.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No enclosing function or symbol was found at the current cursor.");
      return;
    }

    const selection = options?.selectionOverride ?? await modelSelector.pickModel({
      title: "KYC: Select AI Model",
      placeHolder: `Choose a model to explain ${context.symbolName}`
    });
    if (!selection) {
      return;
    }

    setLastActionRunner({
      rerun: async (intent: RerunIntent) => {
        const rerunSelection = intent === "switchModel"
          ? await modelSelector.pickModel({
            title: "KYC: Switch AI Model",
            placeHolder: `Choose a default model to re-explain ${context.symbolName}`,
            forcePrompt: true,
            persistAsDefault: true
          })
          : selection;
        if (!rerunSelection) {
          return;
        }
        await vscode.commands.executeCommand("knowYourCode.explainFunction", {
          forceRefresh: true,
          selectionOverride: rerunSelection
        });
      }
    });

    const activeRequest = activeRequestManager.start(selection.modelName);
    void vscode.commands.executeCommand("setContext", "knowYourCode.isGenerating", true);

    const loadingTitle = `KYC: Explaining ${context.symbolName}`;

    panel.showLoading(
      loadingTitle,
      selection.providerLabel,
      selection.modelName,
      { requestId: activeRequest.requestId, stoppable: true }
    );

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: loadingTitle + "...",
        cancellable: false
      },
      async () => {
        try {
          const { hierarchical, meta } = await explainFunctionHierarchical(orchestrator, context, selection, {
            forceRefresh: options?.forceRefresh,
            signal: activeRequest.controller.signal,
            explainChildren: false
          });

          const callGraph: CallGraphContext = {
            symbolName: context.symbolName,
            callers: context.callers,
            callees: context.callees
          };

          const markdown = formatHierarchicalExplanationMarkdown(
            hierarchical,
            context.symbolName,
            context.code,
            context.range.startLine,
            callGraph
          );

          const tutorialResult = await getTutorialRecommendations(context.code, context.language);
          const references = await buildCodeReferenceMapForDocument(markdown, editor.document, {
            focusedRange: editor.selection,
            seedIdentifiers: [
              context.symbolName,
              ...context.callers.map((item) => item.name),
              ...context.callees.map((item) => item.name),
              ...context.nearbySymbols.map((item) => item.name)
            ]
          });

          const titleSuffix = meta.cacheHit
            ? " (cached)"
            : meta.incremental
              ? ` (incremental: ${meta.changedLines} lines)`
              : "";

          panel.show(
            `KYC: ${context.symbolName}${titleSuffix}`,
            markdown,
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel,
              references,
              tutorials: tutorialResult.tutorials,
              tutorialsCached: tutorialResult.fromCache,
              incremental: meta.incremental,
              changedLines: meta.changedLines,
              tokenUsage: meta.tokenUsage
            }
          );
        } catch (error) {
          if (activeRequest.controller.signal.aborted || isAbortError(error)) {
            panel.showStopped(`KYC: ${context.symbolName}`, selection.providerLabel, selection.modelName);
            return;
          }
          const friendly = formatProviderError(error, selection.provider);
          const fallback = buildFallbackExplanation(context, friendly);
          panel.show(
            `KYC: ${context.symbolName} (fallback)`,
            formatExplanationMarkdown(fallback, context.code, context.range.startLine),
            {
              provider: selection.providerLabel,
              modelName: selection.modelName,
              cacheHit: false
            }
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
