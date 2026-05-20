import type { TutorialDiagram, TutorialPanelMeta, TutorialScript, TutorialShowUiOptions } from "../core/types";
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const TUTORIAL_PLAYER_CSS = `
  .tutorial-player-root { display:flex; flex-direction:column; height:100vh; overflow:hidden; }
  .tutorial-subtoolbar {
    display:flex; gap:8px; align-items:center; flex-wrap:wrap;
    padding:8px 16px; border-bottom:1px solid var(--border); background: var(--bg);
  }
  .tutorial-main { flex:1; overflow:auto; padding:12px 16px 24px; display:flex; flex-direction:column; gap:14px; }
  .tutorial-badge { font-size:11px; opacity:0.85; padding:2px 8px; border-radius:4px; border:1px solid var(--border); }
  .tutorial-summary { font-size:13px; opacity:0.92; line-height:1.45; }
  .tutorial-scene-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
  .tutorial-scene-title { font-size:18px; font-weight:600; margin:0; line-height:1.25; }
  .tutorial-scene-progress { font-size:12px; opacity:0.75; white-space:nowrap; margin-top:4px; }
  .tutorial-narration {
    font-size:14px; line-height:1.55; padding:12px 14px; border-radius:6px;
    background: var(--code-bg); border:1px solid var(--border);
  }
  .tutorial-takeaway { font-size:13px; opacity:0.9; padding-left:2px; }
  .tutorial-code-details summary { cursor:pointer; font-size:12px; margin-bottom:6px; color: var(--accent); }
  .tutorial-code-pre {
    margin:0; padding:10px; overflow:auto; max-height:260px; border-radius:6px; font-size:11px;
    background: var(--code-bg); border:1px solid var(--border);
    white-space:pre; font-family: var(--vscode-editor-font-family, Menlo, monospace);
  }
  .tutorial-nav { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .tutorial-nav .btn { min-width: auto; }
  .tutorial-scene-select { flex:1; min-width:160px; max-width:420px; font-size:12px; padding:6px 8px; border-radius:4px; border:1px solid var(--border); background: var(--bg); color: var(--fg); }
  .tutorial-diagram-wrap { margin-top:4px; padding:12px; border-radius:6px; border:1px solid var(--border); background: var(--bg); }
  .tutorial-diagram-title { font-size:13px; margin:0 0 10px 0; font-weight:600; }
  .tutorial-diagram { display:flex; flex-direction:column; gap:0; }
  .tutorial-diagram-row {
    display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:12px;
    padding:8px 4px; border-bottom:1px solid var(--border);
  }
  .tutorial-diagram-row:last-child { border-bottom:none; }
  .tutorial-diagram-from, .tutorial-diagram-to { font-weight:600; }
  .tutorial-diagram-arrow { opacity:0.65; }
  .tutorial-diagram-label { opacity:0.88; font-size:11px; margin-left:auto; max-width:48%; text-align:right; }
  .tutorial-takeaways-wrap { margin-top:4px; }
  .tutorial-takeaways-wrap h3 { font-size:13px; margin:0 0 6px 0; }
  .tutorial-takeaways { margin:0 0 0 18px; padding:0; font-size:13px; line-height:1.45; }
  .tutorial-takeaways li { margin-bottom:4px; }
  .tutorial-tts-status { font-size:11px; opacity:0.75; margin-left:auto; }
`;

function buildTutorialDiagramHtml(diagram: TutorialDiagram | undefined): string {
  if (!diagram?.steps?.length) {
    return "";
  }

  const stepsHtml = diagram.steps
    .map((step) => {
      const labelHtml = step.label
        ? `<span class="tutorial-diagram-label">${escapeHtml(step.label)}</span>`
        : "";
      return `
    <div class="tutorial-diagram-row">
      <span class="tutorial-diagram-from">${escapeHtml(step.from)}</span>
      <span class="tutorial-diagram-arrow" aria-hidden="true">→</span>
      <span class="tutorial-diagram-to">${escapeHtml(step.to)}</span>
      ${labelHtml}
    </div>`;
    })
    .join("");

  const kind = diagram.type === "flow" ? "Flow overview" : "Sequence overview";

  return `
    <section class="tutorial-diagram-wrap">
      <h3 class="tutorial-diagram-title">${escapeHtml(kind)}</h3>
      <div class="tutorial-diagram">${stepsHtml}</div>
    </section>
  `;
}

/** Builds standalone tutorial player HTML (extends global explanation panel styles via CSS constant import). */
export function buildTutorialPlayerHtml(
  script: TutorialScript,
  meta: TutorialPanelMeta,
  uiOptions: TutorialShowUiOptions,
  baseCss: string
): string {
  const scriptJson = escapeJsonForHtml(script);
  const metaJson = escapeJsonForHtml(meta);
  const provider = uiOptions.provider ?? "unknown";
  const cacheLabel = uiOptions.cacheLabel ?? (uiOptions.cacheHit ? "Cached" : "Generated");
  const modelName = uiOptions.modelName ?? provider;
  const tokenBadge = uiOptions.tokenUsage
    ? `<span class="token-badge" title="Prompt: ${uiOptions.tokenUsage.promptTokens} · Completion: ${uiOptions.tokenUsage.completionTokens}">🪙 ${formatTokenCount(uiOptions.tokenUsage.totalTokens)} tokens</span>`
    : "";

  const modeLabel = meta.tutorialMode === "callflow" ? "Call flow tutorial" : "Function tutorial";
  const diagramHtml = buildTutorialDiagramHtml(script.diagram);
  const takeawaysHtml =
    script.keyTakeaways.length > 0
      ? `<div class="tutorial-takeaways-wrap">
      <h3>Key takeaways</h3>
      <ul class="tutorial-takeaways">${script.keyTakeaways.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseCss}${TUTORIAL_PLAYER_CSS}</style>
</head>
<body class="tutorial-player-root">
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="provider-badge">${escapeHtml(provider)}</span>
      <span class="model-badge">${escapeHtml(modelName)}</span>
      <span class="cache-badge ${uiOptions.cacheHit ? "cache-hit" : "cache-miss"}">${escapeHtml(cacheLabel)}</span>
      <span class="tutorial-badge">${escapeHtml(modeLabel)}</span>
    </div>
    <div class="toolbar-right">
      ${tokenBadge}
      <button class="btn btn-primary" id="tutorialPlayBtn" title="Speak current scene (toggle pause)">
        <span class="btn-icon">🔊</span> Speak scene
      </button>
      <button class="btn" id="tutorialStopSpeechBtn" title="Stop speech" disabled>
        <span class="btn-icon">⏹</span> Stop
      </button>
      <button class="btn" id="tutorialRegenerateBtn" title="Regenerate tutorial">
        <span class="btn-icon">🔄</span> Regenerate
      </button>
      <button class="btn" id="tutorialSwitchBtn" title="Switch AI model">
        <span class="btn-icon">🔀</span> Switch Model
      </button>
    </div>
  </div>
  <div class="tutorial-subtoolbar tutorial-nav">
    <button class="btn" id="tutorialPrevBtn" type="button"><span class="btn-icon">◀</span> Previous</button>
    <button class="btn" id="tutorialNextBtn" type="button">Next <span class="btn-icon">▶</span></button>
    <label class="tutorial-tts-status" style="display:flex;align-items:center;gap:6px;margin-left:8px;">
      <input type="checkbox" id="tutorialAutoAdvance" />
      Auto-advance after speech
    </label>
    <select id="tutorialSceneSelect" class="tutorial-scene-select" aria-label="Jump to scene"></select>
    <span class="tutorial-tts-status" id="tutorialTtsHint"></span>
  </div>
  <div class="tutorial-main">
    <h1 class="title" id="tutorialHeadTitle">${escapeHtml(script.title)}</h1>
    <p class="tutorial-summary">${escapeHtml(script.summary)}</p>
    ${diagramHtml}
    <div class="tutorial-scene-head">
      <h2 class="tutorial-scene-title" id="tutorialSceneTitle"></h2>
      <div class="tutorial-scene-progress" id="tutorialSceneProgress"></div>
    </div>
    <div class="tutorial-narration" id="tutorialNarration"></div>
    <p class="tutorial-takeaway" id="tutorialTakeaway" hidden></p>
    <details class="tutorial-code-details">
      <summary>Source code (${escapeHtml(meta.language)}) — ${escapeHtml(meta.symbolName)}</summary>
      <pre class="tutorial-code-pre"><code>${escapeHtml(meta.sourceCode)}</code></pre>
    </details>
    ${takeawaysHtml}
  </div>
  <script id="kyc-tutorial-data" type="application/json">${scriptJson}</script>
  <script id="kyc-tutorial-meta" type="application/json">${metaJson}</script>
  <script>
    (function () {
      const vscode = acquireVsCodeApi();
      const script = JSON.parse(document.getElementById('kyc-tutorial-data').textContent);
      const meta = JSON.parse(document.getElementById('kyc-tutorial-meta').textContent);
      const scenes = Array.isArray(script.scenes) ? script.scenes : [];
      let sceneIndex = 0;

      const sceneTitleEl = document.getElementById('tutorialSceneTitle');
      const sceneProgressEl = document.getElementById('tutorialSceneProgress');
      const narrationEl = document.getElementById('tutorialNarration');
      const takeawayEl = document.getElementById('tutorialTakeaway');
      const prevBtn = document.getElementById('tutorialPrevBtn');
      const nextBtn = document.getElementById('tutorialNextBtn');
      const selectEl = document.getElementById('tutorialSceneSelect');
      const playBtn = document.getElementById('tutorialPlayBtn');
      const stopSpeechBtn = document.getElementById('tutorialStopSpeechBtn');
      const autoAdvanceEl = document.getElementById('tutorialAutoAdvance');
      const ttsHintEl = document.getElementById('tutorialTtsHint');

      const synth = window.speechSynthesis;
      const ttsSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
      let utterance = null;

      function chunkSpeechText(text) {
        const maxLength = 3500;
        const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
        const chunks = [];
        let chunk = '';
        sentences.forEach(function (sentence) {
          const trimmed = sentence.trim();
          if (!trimmed) return;
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
        if (chunk) chunks.push(chunk);
        return chunks;
      }

      function stopSpeech() {
        if (ttsSupported && synth.speaking) {
          synth.cancel();
        }
        utterance = null;
        if (stopSpeechBtn) stopSpeechBtn.disabled = true;
        if (playBtn) {
          playBtn.classList.remove('is-speaking');
          playBtn.innerHTML = '<span class="btn-icon">🔊</span> Speak scene';
        }
      }

      function speakScene(scene, onEnd) {
        stopSpeech();
        const text = String(scene.narration || '').trim();
        if (!ttsSupported || !text) {
          if (ttsHintEl) ttsHintEl.textContent = !ttsSupported ? 'Speech not available in this webview.' : 'No narration text.';
          if (onEnd) onEnd();
          return;
        }
        if (ttsHintEl) ttsHintEl.textContent = '';
        const chunks = chunkSpeechText(text);
        let i = 0;
        function speakChunk() {
          if (i >= chunks.length) {
            stopSpeech();
            if (onEnd) onEnd();
            return;
          }
          utterance = new SpeechSynthesisUtterance(chunks[i]);
          utterance.rate = 1;
          utterance.pitch = 1;
          utterance.lang = document.documentElement.lang || 'en-US';
          utterance.onend = function () {
            i += 1;
            speakChunk();
          };
          utterance.onerror = function () {
            stopSpeech();
            if (onEnd) onEnd();
          };
          synth.speak(utterance);
        }
        if (stopSpeechBtn) stopSpeechBtn.disabled = false;
        if (playBtn) {
          playBtn.classList.add('is-speaking');
          playBtn.innerHTML = '<span class="btn-icon">⏸</span> Pause';
        }
        speakChunk();
      }

      function applyHighlight(scene) {
        const lines = scene.highlightLines || [];
        let startLine;
        let endLine;
        if (lines.length) {
          startLine = Math.min.apply(null, lines);
          endLine = Math.max.apply(null, lines);
        }
        vscode.postMessage({
          type: 'tutorialHighlight',
          payload: {
            filePath: meta.filePath,
            startLine: typeof startLine === 'number' && startLine > 0 ? startLine : undefined,
            endLine: typeof endLine === 'number' && endLine > 0 ? endLine : undefined,
            identifiers: Array.isArray(scene.highlightIdentifiers) ? scene.highlightIdentifiers : [],
            lineHint: lines.length ? lines[0] : meta.rangeStartLine
          }
        });
      }

      function populateSceneSelect() {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        scenes.forEach(function (s, idx) {
          const opt = document.createElement('option');
          opt.value = String(idx);
          opt.textContent = (idx + 1) + '. ' + (s.title || ('Scene ' + (idx + 1)));
          selectEl.appendChild(opt);
        });
      }

      function renderScene() {
        if (!scenes.length) {
          sceneTitleEl.textContent = 'No scenes';
          narrationEl.textContent = 'The tutorial script did not contain playable scenes.';
          return;
        }
        const scene = scenes[sceneIndex];
        sceneTitleEl.textContent = scene.title || ('Scene ' + (sceneIndex + 1));
        sceneProgressEl.textContent = 'Scene ' + (sceneIndex + 1) + ' / ' + scenes.length;
        narrationEl.textContent = scene.narration || '';
        if (scene.takeaway) {
          takeawayEl.hidden = false;
          takeawayEl.textContent = 'Takeaway: ' + scene.takeaway;
        } else {
          takeawayEl.hidden = true;
          takeawayEl.textContent = '';
        }
        if (selectEl) selectEl.value = String(sceneIndex);
        prevBtn.disabled = sceneIndex <= 0;
        nextBtn.disabled = sceneIndex >= scenes.length - 1;
        stopSpeech();
        applyHighlight(scene);
      }

      function goTo(index) {
        if (!scenes.length) return;
        sceneIndex = Math.max(0, Math.min(scenes.length - 1, index));
        renderScene();
      }

      function maybeAutoAdvance() {
        if (autoAdvanceEl && autoAdvanceEl.checked && sceneIndex < scenes.length - 1) {
          sceneIndex += 1;
          renderScene();
        }
      }

      populateSceneSelect();
      renderScene();

      prevBtn.addEventListener('click', function () { goTo(sceneIndex - 1); });
      nextBtn.addEventListener('click', function () { goTo(sceneIndex + 1); });
      if (selectEl) {
        selectEl.addEventListener('change', function () {
          goTo(Number(selectEl.value));
        });
      }

      playBtn.addEventListener('click', function () {
        if (!scenes.length) return;
        const scene = scenes[sceneIndex];
        if (ttsSupported && synth.speaking && playBtn.classList.contains('is-speaking')) {
          synth.pause();
          playBtn.innerHTML = '<span class="btn-icon">▶</span> Resume';
          return;
        }
        if (ttsSupported && synth.paused && playBtn.classList.contains('is-speaking')) {
          synth.resume();
          playBtn.innerHTML = '<span class="btn-icon">⏸</span> Pause';
          return;
        }
        speakScene(scene, maybeAutoAdvance);
      });

      stopSpeechBtn.addEventListener('click', stopSpeech);

      document.getElementById('tutorialRegenerateBtn').addEventListener('click', function () {
        vscode.postMessage({ type: 'tutorialRegenerate' });
      });
      document.getElementById('tutorialSwitchBtn').addEventListener('click', function () {
        vscode.postMessage({ type: 'tutorialSwitchModel' });
      });

      window.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goTo(sceneIndex + 1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goTo(sceneIndex - 1);
        } else if (event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          playBtn.click();
        }
      });

      window.addEventListener('beforeunload', stopSpeech);
    })();
  </script>
</body>
</html>`;
}
