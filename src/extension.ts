import * as vscode from "vscode";
import { openDatabase } from "./cache/db";
import { ExplanationRepository } from "./cache/explanationRepo";
import { createExplainCurrentFunctionCommand } from "./commands/explainCurrentFunction";
import { createExplainCurrentLineCommand } from "./commands/explainCurrentLine";
import { createExplainCallFlowCommand } from "./commands/explainCallFlow";
import { createRefreshExplanationCommand } from "./commands/refreshExplanation";
import { createRunContextActionCommand } from "./commands/runContextAction";
import { createShowConnectedCallsCommand } from "./commands/showConnectedCalls";
import { createShowContextActionsCommand } from "./commands/showContextActions";
import { createSwitchProviderCommand } from "./commands/switchProvider";
import { createSetApiKeyCommand } from "./commands/setApiKey";
import { ActiveRequestManager } from "./core/activeRequest";
import { getConfig } from "./core/config";
import { LastActionRunner } from "./core/lastAction";
import { ExplanationOrchestrator } from "./core/orchestrator";
import { ModelSelectionService } from "./providers/modelSelector";
import { ContextActionCodeLensProvider } from "./ui/contextActionCodeLensProvider";
import { ExplanationPanel } from "./ui/panel";
import { logInfo } from "./utils/logger";
import { CodeReferenceNavigator, CodeReferenceOccurrence } from "./core/codeReferences";
import { TutorialRepository } from "./cache/tutorialRepo";
import { initTutorialCache } from "./tutorials/recommendations";
import { installBundledCursorSkills } from "./cursor/installCursorSkills";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await installBundledCursorSkills(context);
  let config = getConfig();
  const db = await openDatabase(context);
  const repo = new ExplanationRepository(db);
  const tutorialRepo = new TutorialRepository(db);
  initTutorialCache(tutorialRepo);
  const orchestrator = new ExplanationOrchestrator(repo, config);
  const panel = new ExplanationPanel();
  const codeReferenceNavigator = new CodeReferenceNavigator();
  const modelSelector = new ModelSelectionService(context, () => config);
  const codeLensProvider = new ContextActionCodeLensProvider(() => config);
  const activeRequestManager = new ActiveRequestManager();
  let lastActionRunner: LastActionRunner | undefined;

  const updateGeneratingContext = () =>
    vscode.commands.executeCommand("setContext", "knowYourCode.isGenerating", activeRequestManager.hasActive());

  panel.onMessage((message) => {
    switch (message.type) {
      case "regenerate":
        if (lastActionRunner) {
          void lastActionRunner.rerun("regenerate");
        } else {
          void vscode.commands.executeCommand("knowYourCode.refreshExplanation");
        }
        break;
      case "switchProvider":
        if (lastActionRunner) {
          void lastActionRunner.rerun("switchModel");
        } else {
          void vscode.commands.executeCommand("knowYourCode.switchProvider");
        }
        break;
      case "highlightCode": {
        const payload = message.payload as {
          identifier?: string;
          occurrences?: CodeReferenceOccurrence[];
          lineHint?: number;
        } | undefined;
        if (payload?.identifier) {
          codeReferenceNavigator.scheduleHighlight(
            payload.identifier,
            payload.occurrences ?? [],
            payload.lineHint
          );
        }
        break;
      }
      case "highlightLine": {
        const payload = message.payload as { filePath?: string; line?: number; endLine?: number } | undefined;
        if (typeof payload?.line === "number") {
          codeReferenceNavigator.scheduleHighlightLine(payload.line, payload.endLine, payload.filePath);
        }
        break;
      }
      case "stopGeneration": {
        const payload = message.payload as { requestId?: string } | undefined;
        const stopped = activeRequestManager.stop(payload?.requestId);
        if (stopped) {
          void updateGeneratingContext();
        }
        break;
      }
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "knowYourCode.explainFunction",
      createExplainCurrentFunctionCommand(orchestrator, modelSelector, panel, activeRequestManager, (runner) => {
        lastActionRunner = runner;
      })
    ),
    vscode.commands.registerCommand(
      "knowYourCode.explainCallFlow",
      createExplainCallFlowCommand(orchestrator, modelSelector, panel, activeRequestManager, (runner) => {
        lastActionRunner = runner;
      })
    ),
    vscode.commands.registerCommand(
      "knowYourCode.explainLine",
      createExplainCurrentLineCommand(orchestrator, modelSelector, panel, activeRequestManager, (runner) => {
        lastActionRunner = runner;
      })
    ),
    vscode.commands.registerCommand(
      "knowYourCode.refreshExplanation",
      createRefreshExplanationCommand(
        orchestrator,
        modelSelector,
        panel,
        activeRequestManager,
        () => lastActionRunner
      )
    ),
    vscode.commands.registerCommand(
      "knowYourCode.switchProvider",
      createSwitchProviderCommand(modelSelector)
    ),
    vscode.commands.registerCommand(
      "knowYourCode.setApiKey",
      createSetApiKeyCommand()
    ),
    vscode.commands.registerCommand(
      "knowYourCode.showConnectedCalls",
      createShowConnectedCallsCommand(orchestrator, panel)
    ),
    vscode.commands.registerCommand(
      "knowYourCode.showContextActions",
      createShowContextActionsCommand()
    ),
    vscode.commands.registerCommand(
      "knowYourCode.runContextAction",
      createRunContextActionCommand(orchestrator, modelSelector, panel, activeRequestManager, (runner) => {
        lastActionRunner = runner;
      })
    ),
    vscode.commands.registerCommand("knowYourCode.stopGeneration", () => {
      if (activeRequestManager.stop()) {
        void updateGeneratingContext();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("knowYourCode")) {
        config = getConfig();
        orchestrator.updateConfig(config);
        codeLensProvider.scheduleRefresh();
        logInfo(`Configuration reloaded. Active provider: ${config.activeProvider}`);
      }
    }),
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLensProvider),
    vscode.window.onDidChangeTextEditorSelection(() => {
      codeLensProvider.scheduleRefresh();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      codeLensProvider.scheduleRefresh();
    }),
    vscode.workspace.onDidChangeTextDocument(() => {
      codeLensProvider.scheduleRefresh();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      orchestrator.invalidateFile(document.uri.fsPath);
      codeLensProvider.scheduleRefresh();
      logInfo(`Invalidated cached explanations for ${document.uri.fsPath}`);
    }),
    { dispose: () => codeReferenceNavigator.dispose() },
    { dispose: () => db.close() }
  );

  void updateGeneratingContext();
  logInfo(`Know Your Code activated. Provider: ${config.activeProvider}`);
}

export function deactivate(): void {}
