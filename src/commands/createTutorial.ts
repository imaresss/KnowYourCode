import * as vscode from "vscode";
import { buildContentHash, buildDependencyHash } from "../intelligence/fingerprint";
import { resolveCurrentSymbolContext } from "../intelligence/symbolResolver";
import { buildExplainFunctionInput } from "../intelligence/contextBuilder";
import { ExplanationOrchestrator } from "../core/orchestrator";
import { formatProviderError } from "../core/providerErrors";
import { LastActionRunner, RerunIntent } from "../core/lastAction";
import { ExplainCallFlowInput, ExplainFunctionInput, SelectedModel, TutorialMode } from "../core/types";
import { ModelSelectionService } from "../providers/modelSelector";
import { ExplanationPanel } from "../ui/panel";
import { ActiveRequestManager, isAbortError } from "../core/activeRequest";

export function createCreateTutorialCommand(
  orchestrator: ExplanationOrchestrator,
  modelSelector: ModelSelectionService,
  panel: ExplanationPanel,
  activeRequestManager: ActiveRequestManager,
  setLastActionRunner: (runner: LastActionRunner | undefined) => void
) {
  return async (options?: {
    forceRefresh?: boolean;
    selectionOverride?: SelectedModel;
    mode?: TutorialMode;
  }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a file first to create a tutorial.");
      return;
    }

    const context = await resolveCurrentSymbolContext(editor);
    if (!context) {
      void vscode.window.showWarningMessage("No enclosing function or symbol was found at the current cursor.");
      return;
    }

    let mode = options?.mode;
    if (!mode) {
      const pick = await vscode.window.showQuickPick<
        { label: string; description: string; mode: TutorialMode }
      >(
        [
          {
            label: "Function walkthrough",
            description: "Scene-by-scene narration inside this symbol",
            mode: "function"
          },
          {
            label: "Call flow walkthrough",
            description: "Callers, callees, and execution flow",
            mode: "callflow"
          }
        ],
        {
          title: "KYC: Create Tutorial",
          placeHolder: "Choose tutorial style"
        }
      );
      if (!pick) {
        return;
      }
      mode = pick.mode;
    }

    const { isCursorHandoffEnabled } = await import("../cursor/handoff");
    if (isCursorHandoffEnabled()) {
      const { handoffToCursorChat } = await import("../cursor/handoff");
      const { buildCursorCreateTutorialPrompt } = await import("../cursor/promptAssembler");
      const prompt = buildCursorCreateTutorialPrompt(mode, context);
      await handoffToCursorChat(prompt, `Create Tutorial (${mode}) — ${context.symbolName}`);
      return;
    }

    const fnInput: ExplainFunctionInput = buildExplainFunctionInput(context);
    const cfInput: ExplainCallFlowInput = {
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

    const selection =
      options?.selectionOverride ??
      (await modelSelector.pickModel({
        title: "KYC: Select AI Model",
        placeHolder: `Choose a model to create tutorial (${mode}) for ${context.symbolName}`
      }));
    if (!selection) {
      return;
    }

    const lineRange = {
      startLine: context.range.startLine,
      endLine: context.range.endLine
    };

    setLastActionRunner({
      rerun: async (intent: RerunIntent) => {
        const rerunSelection =
          intent === "switchModel"
            ? await modelSelector.pickModel({
              title: "KYC: Switch AI Model",
              placeHolder: `Choose a model to regenerate tutorial for ${context.symbolName}`,
              forcePrompt: true,
              persistAsDefault: true
            })
            : selection;
        if (!rerunSelection) {
          return;
        }
        await vscode.commands.executeCommand("knowYourCode.createTutorial", {
          forceRefresh: true,
          selectionOverride: rerunSelection,
          mode
        });
      }
    });

    const activeRequest = activeRequestManager.start(selection.modelName);
    void vscode.commands.executeCommand("setContext", "knowYourCode.isGenerating", true);

    const titleSuffix = mode === "callflow" ? "Call Flow" : "Function";

    panel.showLoading(
      `KYC: Tutorial (${titleSuffix}) — ${context.symbolName}`,
      selection.providerLabel,
      selection.modelName,
      { requestId: activeRequest.requestId, stoppable: true }
    );

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `KYC: Building tutorial for ${context.symbolName}...`,
        cancellable: false
      },
      async () => {
        try {
          const payload =
            mode === "function"
              ? fnInput
              : cfInput;
          const { result: script, meta } = await orchestrator.createTutorial(
            mode,
            payload,
            lineRange,
            selection,
            {
              forceRefresh: options?.forceRefresh,
              signal: activeRequest.controller.signal
            }
          );

          panel.showTutorial(
            script,
            {
              filePath: context.filePath,
              symbolName: context.symbolName,
              language: context.language,
              rangeStartLine: context.range.startLine,
              rangeEndLine: context.range.endLine,
              sourceCode: context.code,
              tutorialMode: mode
            },
            {
              provider: meta.providerLabel,
              modelName: meta.modelName,
              cacheHit: meta.cacheHit,
              cacheLabel: meta.cacheLabel,
              tokenUsage: meta.tokenUsage
            }
          );
        } catch (error) {
          if (activeRequest.controller.signal.aborted || isAbortError(error)) {
            panel.showStopped(
              `KYC: Tutorial — ${context.symbolName}`,
              selection.providerLabel,
              selection.modelName
            );
            return;
          }
          const friendly = formatProviderError(error, selection.provider);
          void vscode.window.showErrorMessage(`KYC: Could not create tutorial — ${friendly}`);
        } finally {
          activeRequestManager.complete(activeRequest.requestId);
          void vscode.commands.executeCommand(
            "setContext",
            "knowYourCode.isGenerating",
            activeRequestManager.hasActive()
          );
        }
      }
    );
  };
}
