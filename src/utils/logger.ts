import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Know Your Code");
  }
  return channel;
}

export function logInfo(message: string): void {
  getLogger().appendLine(`[info] ${message}`);
}

export function logError(message: string): void {
  getLogger().appendLine(`[error] ${message}`);
}
