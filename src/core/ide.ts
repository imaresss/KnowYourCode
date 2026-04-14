import * as vscode from "vscode";
import { detectIde, IdeDetectionSnapshot, shouldEnableCursorHandoff } from "./ideDetection";

export { detectIde, shouldEnableCursorHandoff } from "./ideDetection";
export type { IdeDetectionSnapshot, IdeInfo, IdeKind } from "./ideDetection";

export function getCurrentIdeSnapshot(): IdeDetectionSnapshot {
  return {
    appName: vscode.env.appName,
    uriScheme: vscode.env.uriScheme,
    execPath: process.execPath,
    argv0: process.argv0
  };
}

export function detectCurrentIde() {
  return detectIde(getCurrentIdeSnapshot());
}

export function shouldEnableCurrentCursorHandoff(): boolean {
  return shouldEnableCursorHandoff(getCurrentIdeSnapshot());
}
