import * as vscode from "vscode";

export interface PanelShowOptions {
  provider?: string;
  cacheHit?: boolean;
  cacheLabel?: string;
  modelName?: string;
}

type MessageHandler = (message: { type: string; payload?: unknown }) => void;

export class ExplanationPanel {
  private panel: vscode.WebviewPanel | undefined;
  private messageHandler: MessageHandler | undefined;

  public onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  public show(title: string, markdown: string, options: PanelShowOptions = {}): void {
    this.ensurePanel(title);
    this.panel!.title = title;
    this.panel!.webview.html = buildWebviewHtml(markdown, options);
    this.panel!.reveal(vscode.ViewColumn.Beside, true);
  }

  public showLoading(title: string, provider: string, modelName?: string): void {
    this.ensurePanel(title);
    this.panel!.title = title;
    this.panel!.webview.html = buildLoadingHtml(title, provider, modelName);
    this.panel!.reveal(vscode.ViewColumn.Beside, true);
  }

  private ensurePanel(title: string): void {
    if (this.panel) {
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "knowYourCode.explanation",
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, enableFindWidget: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage((message) => {
      if (message.type === "copy") {
        vscode.env.clipboard.writeText(message.payload as string).then(
          () => void vscode.window.showInformationMessage("Explanation copied to clipboard.")
        );
      } else {
        this.messageHandler?.(message);
      }
    });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(md: string): string {
  let html = escapeHtml(md);

  html = html.replace(/^# (.+)$/gm, '<h1 class="title">$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="section-title">$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3>$3</h3>');

  html = html.replace(/```\n([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ordered">$2</li>');
  html = html.replace(/^- (.+)$/gm, '<li class="unordered">$1</li>');

  html = html.replace(
    /(<li class="ordered">[\s\S]*?<\/li>)/g,
    (match) => `<ol>${match}</ol>`
  );
  html = html.replace(/<\/ol>\s*<ol>/g, "");

  html = html.replace(
    /(<li class="unordered">[\s\S]*?<\/li>)/g,
    (match) => `<ul>${match}</ul>`
  );
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  html = html.replace(/^---$/gm, "<hr>");

  html = html.replace(/\n{2,}/g, "</p><p>");
  html = `<p>${html}</p>`;

  html = html.replace(/<p>\s*(<h[1-3])/g, "$1");
  html = html.replace(/(<\/h[1-3]>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<[uo]l>)/g, "$1");
  html = html.replace(/(<\/[uo]l>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<pre)/g, "$1");
  html = html.replace(/(<\/pre>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<hr>)/g, "$1");
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}

function buildWebviewHtml(markdown: string, options: PanelShowOptions): string {
  const contentHtml = markdownToHtml(markdown);
  const provider = options.provider ?? "unknown";
  const cacheLabel = options.cacheLabel ?? (options.cacheHit ? "Cached" : "Generated");
  const modelName = options.modelName ?? provider;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${CSS}</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="provider-badge">${escapeHtml(provider)}</span>
      <span class="model-badge">${escapeHtml(modelName)}</span>
      <span class="cache-badge ${options.cacheHit ? "cache-hit" : "cache-miss"}">${cacheLabel}</span>
    </div>
    <div class="toolbar-right">
      <button class="btn" id="copyBtn" title="Copy explanation to clipboard">
        <span class="btn-icon">📋</span> Copy
      </button>
      <button class="btn btn-primary" id="regenerateBtn" title="Regenerate with fresh AI call">
        <span class="btn-icon">🔄</span> Regenerate
      </button>
      <button class="btn" id="switchBtn" title="Switch AI model">
        <span class="btn-icon">🔀</span> Switch Model
      </button>
    </div>
  </div>
  <div class="content" id="content">
    ${contentHtml}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const content = document.getElementById('content');

    document.getElementById('copyBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', payload: content.innerText });
    });

    document.getElementById('regenerateBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'regenerate' });
    });

    document.getElementById('switchBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'switchProvider' });
    });
  </script>
</body>
</html>`;
}

function buildLoadingHtml(title: string, provider: string, modelName?: string): string {
  const modelBadge = modelName ? `<span class="model-badge">${escapeHtml(modelName)}</span>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${CSS}</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="provider-badge">${escapeHtml(provider)}</span>
      ${modelBadge}
      <span class="cache-badge cache-miss">analyzing...</span>
    </div>
  </div>
  <div class="loading-container">
    <div class="spinner"></div>
    <p class="loading-text">${escapeHtml(title)}</p>
    <p class="loading-subtext">Analyzing code and generating explanation...</p>
  </div>
</body>
</html>`;
}

const CSS = `
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --fg: var(--vscode-editor-foreground, #cccccc);
    --border: var(--vscode-panel-border, #333333);
    --accent: var(--vscode-textLink-foreground, #4fc1ff);
    --badge-bg: var(--vscode-badge-background, #4d4d4d);
    --badge-fg: var(--vscode-badge-foreground, #ffffff);
    --btn-bg: var(--vscode-button-secondaryBackground, #3a3d41);
    --btn-fg: var(--vscode-button-secondaryForeground, #cccccc);
    --btn-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
    --primary-bg: var(--vscode-button-background, #0e639c);
    --primary-fg: var(--vscode-button-foreground, #ffffff);
    --primary-hover: var(--vscode-button-hoverBackground, #1177bb);
    --code-bg: var(--vscode-textCodeBlock-background, #2d2d2d);
    --success: #4ec9b0;
    --warning: #dcdcaa;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--fg);
    background: var(--bg);
    line-height: 1.6;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 10;
    flex-wrap: wrap;
    gap: 6px;
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .provider-badge {
    background: var(--accent);
    color: #000;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cache-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .model-badge {
    background: var(--badge-bg);
    color: var(--badge-fg);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .cache-hit {
    background: var(--success);
    color: #000;
  }

  .cache-miss {
    background: var(--badge-bg);
    color: var(--badge-fg);
  }

  .btn {
    background: var(--btn-bg);
    color: var(--btn-fg);
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background 0.15s;
  }

  .btn:hover { background: var(--btn-hover); }

  .btn-primary {
    background: var(--primary-bg);
    color: var(--primary-fg);
  }

  .btn-primary:hover { background: var(--primary-hover); }

  .btn-icon { font-size: 12px; }

  .content {
    padding: 16px 24px 40px;
    max-width: 800px;
  }

  .title {
    font-size: 1.5em;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--accent);
    border-bottom: 2px solid var(--border);
    padding-bottom: 8px;
  }

  .section-title {
    font-size: 1.1em;
    font-weight: 600;
    margin: 20px 0 8px;
    color: var(--warning);
  }

  h3 {
    font-size: 1em;
    font-weight: 600;
    margin: 16px 0 6px;
  }

  p { margin: 6px 0; }

  ol, ul {
    padding-left: 24px;
    margin: 8px 0;
  }

  li {
    margin: 4px 0;
    line-height: 1.5;
  }

  li.ordered { list-style-type: decimal; }
  li.unordered { list-style-type: disc; }

  .code-block {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
    font-size: 12px;
    margin: 8px 0;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .inline-code {
    background: var(--code-bg);
    padding: 1px 6px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
    font-size: 0.9em;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 20px 0;
  }

  strong { font-weight: 600; color: var(--accent); }
  em { font-style: italic; opacity: 0.85; }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .loading-text {
    margin-top: 20px;
    font-size: 1.1em;
    font-weight: 500;
  }

  .loading-subtext {
    margin-top: 8px;
    opacity: 0.6;
    font-size: 0.9em;
  }
`;
