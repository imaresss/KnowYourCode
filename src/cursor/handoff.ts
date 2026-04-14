import * as vscode from "vscode";
import { getConfig } from "../core/config";

const CHAT_OPEN_COMMANDS = [
  "workbench.action.chat.open",
  "composer.newAgentChat",
  "workbench.action.chat.newChat"
];

/**
 * Copy the prompt to clipboard, try to open Cursor Chat, and notify the user.
 * Returns true if the clipboard was written successfully.
 */
export async function handoffToCursorChat(prompt: string, label: string): Promise<boolean> {
  await vscode.env.clipboard.writeText(prompt);

  let chatOpened = false;
  for (const cmd of CHAT_OPEN_COMMANDS) {
    try {
      await vscode.commands.executeCommand(cmd);
      chatOpened = true;
      break;
    } catch {
      // command not available in this host; try next
    }
  }

  if (chatOpened) {
    try {
      await new Promise((r) => setTimeout(r, 150));
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
      void vscode.window.showInformationMessage(`KYC: ${label} — prompt pasted into Chat. Press Send.`);
    } catch {
      void vscode.window.showInformationMessage(`KYC: ${label} — prompt copied. Paste (Cmd+V) into Chat and Send.`);
    }
  } else {
    void vscode.window.showInformationMessage(`KYC: ${label} — prompt copied to clipboard. Open Cursor Chat, paste, and Send.`);
  }

  return true;
}

export function isCursorHandoffEnabled(): boolean {
  return getConfig().cursorHandoff;
}
