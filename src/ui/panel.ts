import * as vscode from "vscode";
import { CodeReferenceMapEntry } from "../core/codeReferences";
import { TutorialRecommendation } from "../tutorials/recommendations";

export interface PanelShowOptions {
  provider?: string;
  cacheHit?: boolean;
  cacheLabel?: string;
  modelName?: string;
  references?: CodeReferenceMapEntry[];
  tutorials?: TutorialRecommendation[];
  tutorialsCached?: boolean;
  incremental?: boolean;
  changedLines?: number;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface LoadingStateOptions {
  requestId?: string;
  stoppable?: boolean;
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

  public showLoading(title: string, provider: string, modelName?: string, options: LoadingStateOptions = {}): void {
    this.ensurePanel(title);
    this.panel!.title = title;
    this.panel!.webview.html = buildLoadingHtml(title, provider, modelName, options);
    this.panel!.reveal(vscode.ViewColumn.Beside, true);
  }

  public showStopped(title: string, provider: string, modelName?: string): void {
    this.ensurePanel(title);
    this.panel!.title = title;
    this.panel!.webview.html = buildStoppedHtml(title, provider, modelName);
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

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
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
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");

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
  const references = options.references ?? [];
  const contentHtml = annotateCodeReferences(markdownToHtml(markdown), references);
  const tutorialsHtml = buildTutorialsHtml(options.tutorials ?? [], options.tutorialsCached);
  const referenceLookupJson = JSON.stringify(buildReferenceLookup(references))
    .replace(/</g, "\\u003c");
  const sourceFilePathJson = JSON.stringify(findDefaultSourceFilePath(references))
    .replace(/</g, "\\u003c");
  const provider = options.provider ?? "unknown";
  const cacheLabel = options.cacheLabel ?? (options.cacheHit ? "Cached" : "Generated");
  const modelName = options.modelName ?? provider;
  const incrementalBadge = options.incremental
    ? `<span class="cache-badge incremental-badge" title="Only ${options.changedLines ?? "a few"} changed lines were sent to the model">⚡ Incremental (${options.changedLines ?? "?"} lines)</span>`
    : "";
  const tokenBadge = options.tokenUsage
    ? `<span class="token-badge" title="Prompt: ${options.tokenUsage.promptTokens} · Completion: ${options.tokenUsage.completionTokens}">🪙 ${formatTokenCount(options.tokenUsage.totalTokens)} tokens</span>`
    : "";

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
      ${incrementalBadge}
    </div>
    <div class="toolbar-right">
      ${tokenBadge}
      <button class="btn" id="copyBtn" title="Copy explanation to clipboard">
        <span class="btn-icon">📋</span> Copy
      </button>
      <button class="btn btn-primary" id="regenerateBtn" title="Regenerate with fresh AI call">
        <span class="btn-icon">🔄</span> Regenerate
      </button>
      <button class="btn" id="switchBtn" title="Switch AI model">
        <span class="btn-icon">🔀</span> Switch Model
      </button>
      <button class="btn" id="stopSpeechBtn" title="Stop speech playback" disabled>
        <span class="btn-icon">⏹</span> Stop
      </button>
    </div>
  </div>
  <div class="content" id="content">
    ${contentHtml}
  </div>
  ${tutorialsHtml}
  <script>
    const vscode = acquireVsCodeApi();
    const content = document.getElementById('content');
    const stopSpeechBtn = document.getElementById('stopSpeechBtn');
    const referenceLookup = ${referenceLookupJson};
    const sourceFilePath = ${sourceFilePathJson};
    const tts = createTtsController(content, stopSpeechBtn);

    enhanceLineNavigation(content);
    enhanceSectionSpeechControls(content, tts);

    document.getElementById('copyBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', payload: content.innerText });
    });

    document.getElementById('regenerateBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'regenerate' });
    });

    document.getElementById('switchBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'switchProvider' });
    });

    stopSpeechBtn.addEventListener('click', () => {
      tts.stop();
    });

    window.addEventListener('beforeunload', () => {
      tts.destroy();
    });

    window.addEventListener('keydown', (event) => {
      if (event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        tts.stop();
      }
    });

    window.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const lineLink = target.closest('.kyc-line-link');
      if (lineLink instanceof HTMLElement) {
        const lineNumber = Number(lineLink.dataset.line);
        const endLineNumber = Number(lineLink.dataset.endLine);
        if (Number.isFinite(lineNumber) && lineNumber > 0) {
          vscode.postMessage({
            type: 'highlightLine',
            payload: {
              filePath: sourceFilePath,
              line: lineNumber,
              endLine: Number.isFinite(endLineNumber) && endLineNumber > 0 ? endLineNumber : lineNumber
            }
          });
          return;
        }
      }
      const ref = target.closest('.kyc-ref');
      let identifier = ref instanceof HTMLElement ? ref.dataset.id : undefined;
      if (!identifier) {
        const inlineCode = target.closest('code.inline-code');
        if (inlineCode instanceof HTMLElement) {
          identifier = extractIdentifier(inlineCode.innerText);
        }
      }
      if (!identifier) {
        return;
      }
      const lineHint = extractLineHint(target);
      vscode.postMessage({
        type: 'highlightCode',
        payload: {
          identifier,
          occurrences: Array.isArray(referenceLookup[identifier]) ? referenceLookup[identifier] : [],
          lineHint
        }
      });
    });

    function extractLineHint(element) {
      return extractLineRange(element)?.startLine;
    }

    function extractLineRange(element) {
      if (!(element instanceof HTMLElement)) {
        return undefined;
      }
      const container = element.closest('li, p, div, section, article') || element;
      const text = (container && 'innerText' in container ? container.innerText : element.innerText) || '';
      const match = text.match(/\\bL(\\d+)(?:-L?(\\d+))?\\b/i);
      if (!match) {
        return undefined;
      }
      const startLine = Number(match[1]);
      const explicitEndLine = Number(match[2]);
      if (!Number.isFinite(startLine) || startLine <= 0) {
        return undefined;
      }
      const endLine = Number.isFinite(explicitEndLine) && explicitEndLine >= startLine
        ? explicitEndLine
        : startLine;
      return { startLine, endLine };
    }

    function enhanceLineNavigation(root) {
      if (!root) {
        return;
      }
      const walkthrough = findSectionHeading(root, 'step-by-step walkthrough');
      if (!walkthrough) {
        return;
      }

      collectSectionSpeechTarget(walkthrough).forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        node.querySelectorAll('li').forEach((item) => {
          const lineRange = extractLineRange(item);
          if (!lineRange) {
            return;
          }
          item.classList.add('kyc-line-link');
          item.dataset.line = String(lineRange.startLine);
          item.dataset.endLine = String(lineRange.endLine);
          item.title = lineRange.startLine === lineRange.endLine
            ? 'Click to highlight line ' + lineRange.startLine + ' in code'
            : 'Click to highlight lines ' + lineRange.startLine + '-' + lineRange.endLine + ' in code';
          item.tabIndex = 0;
          item.setAttribute('role', 'button');
          item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              item.click();
            }
          });
        });
      });
    }

    function findSectionHeading(root, title) {
      return Array.from(root.querySelectorAll('h2.section-title')).find((heading) => {
        const text = heading.textContent ? heading.textContent.trim().toLowerCase() : '';
        return text === title;
      });
    }

    function enhanceSectionSpeechControls(root, ttsController) {
      if (!root) {
        return;
      }
      const headings = Array.from(root.querySelectorAll('h2.section-title'));
      headings.forEach((heading, index) => {
        const sectionId = 'tts-section-' + index;
        const title = heading.textContent ? heading.textContent.trim() : 'section';
        if (title.toLowerCase() === 'call graph') {
          return;
        }
        const speechTarget = collectSectionSpeechTarget(heading);
        const text = getReadableText(speechTarget);
        heading.dataset.ttsSectionId = sectionId;
        speechTarget.forEach((node) => {
          if (node instanceof HTMLElement) {
            node.dataset.ttsParentSectionId = sectionId;
          }
        });

        const button = document.createElement('button');
        button.className = 'section-speech-btn';
        button.type = 'button';
        button.title = text
          ? 'Listen to ' + title + ' (click again to pause)'
          : 'No readable content in this section';
        button.setAttribute('aria-label', 'Listen to ' + title);
        button.dataset.ttsSectionId = sectionId;
        button.textContent = '🔊';
        button.disabled = !text || !ttsController.isSupported();
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          ttsController.toggle(sectionId, text);
        });
        heading.appendChild(button);
      });

      if (!ttsController.isSupported()) {
        const note = document.createElement('p');
        note.className = 'tts-status tts-status-warning';
        note.textContent = 'Text-to-speech is not available in this webview.';
        root.prepend(note);
      }
    }

    function collectSectionSpeechTarget(heading) {
      const nodes = [];
      let cursor = heading.nextElementSibling;
      while (cursor && !isPeerSectionBoundary(cursor)) {
        nodes.push(cursor);
        cursor = cursor.nextElementSibling;
      }
      return nodes;
    }

    function isPeerSectionBoundary(element) {
      return element.matches('h2.section-title, hr');
    }

    function getReadableText(nodes) {
      return nodes
        .map((node) => node instanceof HTMLElement ? node.innerText : '')
        .join('\\n')
        .replace(/\\s+/g, ' ')
        .trim();
    }

    function createTtsController(root, stopButton) {
      const synth = window.speechSynthesis;
      const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
      let currentUtterance = null;
      let currentSectionId = null;
      let currentChunks = [];
      let currentChunkIndex = 0;
      let lastClickAt = 0;

      function isSupported() {
        return supported;
      }

      function toggle(sectionId, text) {
        if (!supported || !text) {
          return;
        }

        const now = Date.now();
        if (now - lastClickAt < 200) {
          return;
        }
        lastClickAt = now;

        if (currentSectionId === sectionId && synth.paused) {
          synth.resume();
          updatePlaybackUi(sectionId, 'speaking');
          return;
        }

        if (currentSectionId === sectionId && synth.speaking) {
          synth.pause();
          updatePlaybackUi(sectionId, 'paused');
          return;
        }

        speak(sectionId, text);
      }

      function speak(sectionId, text) {
        stop();
        currentSectionId = sectionId;
        currentChunks = chunkSpeechText(text);
        currentChunkIndex = 0;
        updatePlaybackUi(sectionId, 'speaking');
        speakCurrentChunk();
      }

      function speakCurrentChunk() {
        if (!supported || !currentSectionId || currentChunkIndex >= currentChunks.length) {
          stop();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(currentChunks[currentChunkIndex]);
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.lang = document.documentElement.lang || 'en-US';
        utterance.onend = () => {
          if (utterance !== currentUtterance || !currentSectionId) {
            return;
          }
          currentChunkIndex += 1;
          speakCurrentChunk();
        };
        utterance.onerror = () => {
          stop();
        };
        currentUtterance = utterance;
        synth.speak(utterance);
      }

      function stop() {
        const previousSectionId = currentSectionId;
        currentUtterance = null;
        currentSectionId = null;
        currentChunks = [];
        currentChunkIndex = 0;
        if (supported) {
          synth.cancel();
        }
        if (previousSectionId) {
          updatePlaybackUi(previousSectionId, 'idle');
        }
        updateStopButton(false);
      }

      function destroy() {
        stop();
      }

      function updatePlaybackUi(sectionId, state) {
        updateStopButton(state !== 'idle');
        root.querySelectorAll('.tts-speaking, .tts-paused').forEach((element) => {
          element.classList.remove('tts-speaking', 'tts-paused');
        });
        root.querySelectorAll('.section-speech-btn').forEach((button) => {
          button.classList.remove('is-speaking', 'is-paused');
          button.textContent = '🔊';
          button.setAttribute('aria-pressed', 'false');
        });

        if (state === 'idle') {
          return;
        }

        const heading = root.querySelector('[data-tts-section-id="' + sectionId + '"].section-title');
        const button = root.querySelector('.section-speech-btn[data-tts-section-id="' + sectionId + '"]');
        const sectionNodes = root.querySelectorAll('[data-tts-parent-section-id="' + sectionId + '"]');
        if (heading) {
          heading.classList.add(state === 'paused' ? 'tts-paused' : 'tts-speaking');
        }
        sectionNodes.forEach((element) => {
          element.classList.add(state === 'paused' ? 'tts-paused' : 'tts-speaking');
        });
        if (button) {
          button.classList.add(state === 'paused' ? 'is-paused' : 'is-speaking');
          button.textContent = state === 'paused' ? '▶' : '⏸';
          button.setAttribute('aria-pressed', 'true');
        }
      }

      function updateStopButton(enabled) {
        if (!stopButton) {
          return;
        }
        stopButton.disabled = !enabled;
      }

      return { destroy, isSupported, stop, toggle };
    }

    function chunkSpeechText(text) {
      const maxLength = 3500;
      const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
      const chunks = [];
      let chunk = '';
      sentences.forEach((sentence) => {
        const trimmed = sentence.trim();
        if (!trimmed) {
          return;
        }
        if ((chunk + ' ' + trimmed).trim().length > maxLength && chunk) {
          chunks.push(chunk.trim());
          chunk = '';
        }
        if (trimmed.length > maxLength) {
          for (let i = 0; i < trimmed.length; i += maxLength) {
            chunks.push(trimmed.slice(i, i + maxLength));
          }
        } else {
          chunk = (chunk + ' ' + trimmed).trim();
        }
      });
      if (chunk) {
        chunks.push(chunk);
      }
      return chunks;
    }

  </script>
</body>
</html>`;
}

function buildLoadingHtml(
  title: string,
  provider: string,
  modelName?: string,
  options: LoadingStateOptions = {}
): string {
  const modelBadge = modelName ? `<span class="model-badge">${escapeHtml(modelName)}</span>` : "";
  const requestId = options.requestId ? escapeHtml(options.requestId) : "";
  const stopButton = options.stoppable
    ? `<button class="btn btn-stop" id="stopBtn" title="Stop ongoing generation">⛔ Stop Generating</button>`
    : "";
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
    <p class="loading-subtext" id="loadingStatus">Analyzing code and generating explanation...</p>
    ${stopButton}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const stopBtn = document.getElementById('stopBtn');
    const loadingStatus = document.getElementById('loadingStatus');
    let stopRequested = false;

    const requestStop = () => {
      if (stopRequested || !stopBtn) {
        return;
      }
      stopRequested = true;
      stopBtn.setAttribute('disabled', 'true');
      if (loadingStatus) {
        loadingStatus.textContent = 'Stopping generation...';
      }
      vscode.postMessage({ type: 'stopGeneration', payload: { requestId: '${requestId}' } });
    };

    if (stopBtn) {
      stopBtn.addEventListener('click', requestStop);
    }
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        requestStop();
      }
    });
  </script>
</body>
</html>`;
}

function buildStoppedHtml(title: string, provider: string, modelName?: string): string {
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
      <span class="cache-badge cache-miss">stopped</span>
    </div>
  </div>
  <div class="loading-container">
    <p class="stopped-icon">⛔</p>
    <p class="loading-text">${escapeHtml(title)}</p>
    <p class="loading-subtext">Generation stopped by user</p>
    <button class="btn btn-primary stopped-regenerate-btn" id="regenerateBtn" title="Regenerate this explanation">
      <span class="btn-icon">🔄</span> Regenerate
    </button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('regenerateBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'regenerate' });
    });
  </script>
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

  .incremental-badge {
    background: #e8a317;
    color: #000;
    font-weight: 600;
  }

  .token-badge {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    cursor: default;
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

  .btn-stop {
    margin-top: 12px;
    background: #7f1d1d;
    color: #fff;
    border: 1px solid #dc2626;
  }

  .btn-stop:hover {
    background: #991b1b;
  }

  .btn[disabled] {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn-icon { font-size: 12px; }

  .content {
    padding: 16px 24px 40px;
    max-width: 800px;
  }

  .title {
    font-size: 1.25em;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--accent);
    border-bottom: 2px solid var(--border);
    padding-bottom: 8px;
  }

  .section-title {
    font-size: 1em;
    font-weight: 600;
    margin: 20px 0 8px;
    color: var(--warning);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-speech-btn {
    background: transparent;
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    min-width: 28px;
    height: 24px;
    padding: 0 6px;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .section-speech-btn:hover:not([disabled]),
  .section-speech-btn.is-speaking,
  .section-speech-btn.is-paused {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    border-color: var(--accent);
    color: var(--accent);
  }

  .section-speech-btn[disabled] {
    cursor: not-allowed;
    opacity: 0.35;
  }

  .tts-speaking {
    background: color-mix(in srgb, var(--accent) 9%, transparent);
    outline: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
    outline-offset: 3px;
    border-radius: 4px;
  }

  .tts-paused {
    background: color-mix(in srgb, var(--warning) 8%, transparent);
    outline: 1px dashed color-mix(in srgb, var(--warning) 35%, transparent);
    outline-offset: 3px;
    border-radius: 4px;
  }

  .tts-status {
    margin: 0 0 12px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
  }

  .tts-status-warning {
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

  .kyc-ref {
    cursor: pointer;
    border-bottom: 1px dotted var(--accent);
    transition: background-color 0.15s ease;
  }

  .kyc-ref:hover {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .kyc-line-link {
    cursor: pointer;
    border-radius: 4px;
    padding: 2px 4px;
    transition: background-color 0.15s ease, outline-color 0.15s ease;
  }

  .kyc-line-link:hover,
  .kyc-line-link:focus {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    outline: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
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

  .stopped-icon {
    font-size: 32px;
    line-height: 1;
  }

  .stopped-regenerate-btn {
    margin-top: 16px;
    display: inline-flex;
  }

  .tutorials {
    margin: 4px 24px 24px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--code-bg) 45%, transparent);
  }

  .tutorials-title {
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--warning);
  }

  .tutorial-item {
    margin: 8px 0;
    padding: 6px 0;
    border-top: 1px dashed var(--border);
  }

  .tutorial-item:first-of-type {
    border-top: none;
    padding-top: 0;
  }

  .tutorial-item-name {
    font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
    color: var(--accent);
    font-size: 12px;
  }

  .tutorial-item-summary {
    margin: 2px 0 4px;
    opacity: 0.85;
    font-size: 12px;
  }

  .tutorial-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tutorial-link {
    font-size: 12px;
    text-decoration: none;
    color: var(--primary-fg);
    background: var(--primary-bg);
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 2px 8px;
  }

  .tutorial-link:hover {
    background: var(--primary-hover);
  }
`;

function annotateCodeReferences(html: string, references: CodeReferenceMapEntry[]): string {
  const identifiers = new Set<string>(
    references
      .map((entry) => normalizeIdentifier(entry.identifier))
      .filter((identifier): identifier is string => Boolean(identifier))
  );

  // First pass: annotate inline code blocks. This works even without precomputed references.
  const withInlineCodeRefs = html.replace(
    /<code class="inline-code">([^<]+)<\/code>/g,
    (full, token: string) => {
      const identifier = extractIdentifier(token);
      if (!identifier) {
        return full;
      }
      identifiers.add(identifier);
      return `<span class="kyc-ref" data-id="${identifier}" title="Click to locate in code">${full}</span>`;
    }
  );

  if (identifiers.size === 0) {
    return withInlineCodeRefs;
  }

  // Second pass: annotate bare function-call style references in text nodes only.
  const parts = withInlineCodeRefs.split(/(<[^>]+>)/g);
  const sortedIdentifiers = Array.from(identifiers).sort((a, b) => b.length - a.length);
  const alternation = sortedIdentifiers.map((id) => escapeRegExp(id)).join("|");
  const callOrIdentifierPattern = alternation
    ? new RegExp(`\\b(${alternation})(\\s*\\(\\))?\\b`, "g")
    : undefined;

  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i].startsWith("<")) {
      continue;
    }
    if (!callOrIdentifierPattern) {
      continue;
    }
    parts[i] = parts[i].replace(callOrIdentifierPattern, (_full, id: string, callSuffix: string) => {
      const token = `${id}${callSuffix ?? ""}`;
      return `<span class="kyc-ref" data-id="${id}" title="Click to locate in code">${token}</span>`;
    });
  }
  return parts.join("");
}

function extractIdentifier(token: string): string | undefined {
  const trimmed = token.trim();
  const functionMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\(\)$/);
  if (functionMatch) {
    return normalizeIdentifier(functionMatch[1]);
  }
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    return normalizeIdentifier(parts[parts.length - 1] ?? "");
  }
  return normalizeIdentifier(trimmed);
}

function normalizeIdentifier(identifier: string): string | undefined {
  const cleaned = identifier
    .trim()
    .replace(/^[^A-Za-z_$]+/, "")
    .replace(/[^A-Za-z0-9_$]+$/g, "");
  if (!cleaned || !/^[A-Za-z_$][\w$]*$/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildReferenceLookup(references: CodeReferenceMapEntry[]): Record<string, CodeReferenceMapEntry["occurrences"]> {
  const lookup: Record<string, CodeReferenceMapEntry["occurrences"]> = {};
  for (const reference of references) {
    const id = normalizeIdentifier(reference.identifier);
    if (!id || reference.occurrences.length === 0) {
      continue;
    }
    lookup[id] = reference.occurrences;
  }
  return lookup;
}

function findDefaultSourceFilePath(references: CodeReferenceMapEntry[]): string | undefined {
  for (const reference of references) {
    const occurrence = reference.occurrences[0];
    if (occurrence?.filePath) {
      return occurrence.filePath;
    }
  }
  return undefined;
}

function buildTutorialsHtml(tutorials: TutorialRecommendation[], fromCache?: boolean): string {
  if (tutorials.length === 0) {
    return "";
  }

  const cacheBadge = fromCache !== undefined
    ? (fromCache
      ? '<span class="cache-badge cache-hit" style="margin-left:8px;font-size:10px">Cached</span>'
      : '<span class="cache-badge cache-miss" style="margin-left:8px;font-size:10px">Generated</span>')
    : "";

  const items = tutorials.map((tutorial) => {
    const safeId = escapeHtml(tutorial.identifier);
    const safeSummary = escapeHtml(tutorial.summary);
    const links = tutorial.sources.map((source) => {
      const name = escapeHtml(source.name);
      const url = escapeHtml(source.url);
      return `<a class="tutorial-link" href="${url}" target="_blank" rel="noopener noreferrer">Learn More - ${name}</a>`;
    }).join("");

    return `
      <div class="tutorial-item">
        <div class="tutorial-item-name">${safeId}</div>
        <div class="tutorial-item-summary">${safeSummary}</div>
        <div class="tutorial-links">${links}</div>
      </div>
    `;
  }).join("");

  return `
    <section class="tutorials">
      <div class="tutorials-title">📚 Related Tutorials ${cacheBadge}</div>
      ${items}
    </section>
  `;
}
