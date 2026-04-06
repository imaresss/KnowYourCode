import * as vscode from "vscode";

export class ExplanationPanel {
  private panel: vscode.WebviewPanel | undefined;

  public show(title: string, markdown: string): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "knowYourCode.explanation",
        title,
        vscode.ViewColumn.Beside,
        { enableFindWidget: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.title = title;
    this.panel.webview.html = renderHtml(markdown);
    this.panel.reveal(vscode.ViewColumn.Beside);
  }
}

function renderHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
  <html lang="en">
    <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; line-height: 1.5;">
      <pre style="white-space: pre-wrap;">${escaped}</pre>
    </body>
  </html>`;
}
