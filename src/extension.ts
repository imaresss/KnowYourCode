import * as vscode from "vscode";
import { openDatabase } from "./cache/db";
import { ExplanationRepository } from "./cache/explanationRepo";
import { createExplainCurrentFunctionCommand } from "./commands/explainCurrentFunction";
import { createExplainCurrentLineCommand } from "./commands/explainCurrentLine";
import { createRefreshExplanationCommand } from "./commands/refreshExplanation";
import { createShowConnectedCallsCommand } from "./commands/showConnectedCalls";
import { getConfig } from "./core/config";
import { ExplanationOrchestrator } from "./core/orchestrator";
import { CloudProvider } from "./providers/cloudProvider";
import { LocalProvider } from "./providers/localProvider";
import { ModelProvider } from "./providers/modelProvider";
import { ExplanationPanel } from "./ui/panel";
import { logInfo } from "./utils/logger";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();
  const db = await openDatabase(context);
  const repo = new ExplanationRepository(db);
  const provider = buildProvider(config);
  const orchestrator = new ExplanationOrchestrator(repo, config, provider);
  const panel = new ExplanationPanel();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "knowYourCode.explainCurrentFunction",
      createExplainCurrentFunctionCommand(orchestrator, panel)
    ),
    vscode.commands.registerCommand(
      "knowYourCode.explainCurrentLine",
      createExplainCurrentLineCommand(orchestrator, panel)
    ),
    vscode.commands.registerCommand(
      "knowYourCode.refreshExplanation",
      createRefreshExplanationCommand(orchestrator, panel)
    ),
    vscode.commands.registerCommand(
      "knowYourCode.showConnectedCalls",
      createShowConnectedCallsCommand(orchestrator, panel)
    ),
    vscode.workspace.onDidSaveTextDocument((document) => {
      orchestrator.invalidateFile(document.uri.fsPath);
      logInfo(`Invalidated cached explanations for ${document.uri.fsPath}`);
    }),
    { dispose: () => db.close() }
  );

  logInfo(`Know Your Code activated in ${config.providerMode} mode.`);
}

function buildProvider(config: ReturnType<typeof getConfig>): ModelProvider {
  if (config.providerMode === "cloud") {
    return new CloudProvider(config.cloudEndpoint, config.apiKey, config.modelName);
  }
  return new LocalProvider(config.localEndpoint, config.modelName);
}

export function deactivate(): void {}
