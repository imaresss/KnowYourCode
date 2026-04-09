# KYC - Know Your Code

An intelligent VS Code extension that helps developers understand, analyze, navigate, and learn code using AI, with model-aware caching, contextual code intelligence, tutorial links, clickable explanations, cancellation, and section-level text-to-speech.

## Overview

KYC (Know Your Code) is a context-aware AI assistant inside VS Code.

It helps you:

- Explain functions, the current line, selected code, and call flows
- Navigate from explanation steps back into the source file
- Highlight referenced identifiers and walkthrough line ranges
- Learn built-in APIs through related tutorial links
- Listen to explanation sections with browser-native Text-to-Speech
- Stop long-running generations and regenerate the same explanation
- Reduce repeated API usage with persistent caching

## Key Features

### Code Understanding

- **Explain Function** - purpose, walkthrough, inputs, outputs, dependencies, and child function summary
- **Explain Current Line** - focused explanation of the line under the cursor
- **Explain Selected Code** - available from KYC context actions
- **Explain Line-by-Line** - available from KYC context actions
- **Call Flow Analysis** - execution flow, data flow, entry points, exit points, and side effects
- **Connected Calls Snapshot** - inspect callers, direct callees, and cached call graph data

### Interactive Code Sync

- Click inline code references in an explanation to highlight them in the editor
- Click any `Step-by-Step Walkthrough` item with `L123` to navigate to that source line
- Click a nested range such as `L836-L839` to select and highlight the whole source range
- Source navigation is file-aware, so it opens the original file instead of relying on webview focus

### Tutorial Integration

KYC detects common built-in APIs used by the code and adds cached tutorial recommendations.

Examples of tutorial sources:

- MDN
- W3Schools
- Python docs
- Oracle / Java docs
- Other official language or runtime references when available

Tutorials are cached separately from AI explanations so repeated reads stay fast.

### Text-to-Speech

The explanation webview uses the browser-native `speechSynthesis` API.

Supported interactions:

- Speaker button beside explanation sections
- Section-isolated playback: only the clicked section is spoken
- Pause / resume by clicking the same section button
- Stop current playback from the toolbar
- Stop previous speech when a different section starts
- Highlight the section while it is speaking or paused
- Chunk long text before speaking
- Disable speech buttons when a section is empty or TTS is unavailable

Current narrated sections include sections such as:

- Purpose
- Step-by-Step Walkthrough
- Inputs
- Outputs
- Dependencies
- Other generated `##` explanation sections

The `Call Graph` heading is intentionally not given a speaker button.

### Stop Generation

- Click **Stop Generating** while an AI request is running
- Press `Escape` while the loading panel is focused
- KYC aborts the active request with `AbortController`
- The stopped screen includes **Regenerate** so you can retry the same explanation

### Smart Caching

- Function-level explanation cache
- Selection-level reuse from function cache
- Model-aware and provider-aware cache keys
- Dependency hash tracking
- Tutorial cache
- Parent + child hierarchical explanation cache
- Optional TTL configuration
- Cache invalidation on file save
- Fresh generation through **Regenerate**

## Quick Start

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Launch

Press `F5` in VS Code to open an Extension Development Host.

### Configure a Provider

Run this from the command palette:

```text
KYC: Set API Key
```

Then choose OpenAI, Claude, or Gemini and enter your key.

You can switch the default model later:

```text
KYC: Switch Default AI Model
```

Local models can be enabled through the local provider settings.

## Commands

| Command | Default Keybinding | What It Does |
| --- | --- | --- |
| `KYC: Explain Function` | `Cmd+Shift+E` / `Ctrl+Shift+E` | Explain the function at the cursor or selected function-like code. |
| `KYC: Explain Line` | `Cmd+Shift+L` / `Ctrl+Shift+L` | Explain the current editor line in context. |
| `KYC: Explain Call Flow` | `Cmd+Shift+F` / `Ctrl+Shift+F` | Explain execution/data flow for the current function. |
| `KYC: Show Context Actions` | `Cmd+Shift+K` / `Ctrl+Shift+K` | Show selection-aware actions such as explain selected code. |
| `KYC: Show Connected Calls` | - | Show callers, callees, and cached call graph details. |
| `KYC: Switch Default AI Model` | - | Pick provider + model and persist it as default. |
| `KYC: Set API Key` | - | Configure OpenAI / Claude / Gemini key. |
| `KYC: Stop Generation` | `Escape` while generating | Abort the current generation. |

## UX Flow

```text
Cursor / Selection
        |
        v
Resolve function / line / selection context
        |
        v
Choose default or selected model
        |
        v
Check explanation cache
        |
   +----+----------------+
   |                     |
   v                     v
Cache hit           Cache miss
   |                     |
   v                     v
Render panel        Call AI provider
                         |
                         v
                    Normalize response
                         |
                         v
                    Save explanation
                         |
                         v
                    Render panel
        |
        v
Copy / Regenerate / Switch / TTS / Click-to-highlight
```

## Architecture Overview

```text
+-----------------------------+
|        VS Code Editor       |
+-------------+---------------+
              |
              v
+-----------------------------+
|       KYC Extension Core    |
|  commands + orchestration   |
+-------------+---------------+
              |
  +-----------+------------+----------------+
  |                        |                |
  v                        v                v
Symbol / context      Cache Layer      AI Providers
resolution            sql.js DB        OpenAI
VS Code APIs          memory cache     Claude
text dependency scan  repositories     Gemini
                                       Local
  |
  v
+-----------------------------+
|     Webview Response Panel  |
|  rendered HTML/CSS/JS       |
|  TTS controls               |
|  tutorial links             |
|  clickable code references  |
+-----------------------------+
```

## Chunking / Hunking Strategy

KYC tries to reason about logical code regions instead of treating every request as unrelated raw text.

```text
Raw editor document
        |
        v
VS Code document symbols
        |
        v
Function / method context
        |
        v
+-----------------------+
| Parent function A     |
| - direct callee B     |
| - direct callee C     |
| - direct callee D     |
+-----------------------+
        |
        v
AI prompt + dependency metadata
```

### Explanation Strategy

| Scope | Behavior |
| --- | --- |
| Parent function | Fully explained with structured JSON result. |
| Direct child functions | Summarized through hierarchical explanation; cache is reused when available. |
| Deeper nested calls | Resolved on demand through follow-up actions / direct cursor actions. |
| Selected code | May reuse the cached enclosing function explanation. |

## Caching Architecture

KYC stores explanations in a persistent sql.js-backed database under the extension global storage path.

The effective explanation lookup includes:

```text
symbol_key
+ explanation_type
+ content_hash
+ dependency_hash
+ provider
+ model_name
+ prompt_version
```

### Cache Types

#### Function / Action Explanation Cache

```json
{
  "symbolKey": "src/example.ts::saveOrder",
  "explanationType": "explainFunction",
  "contentHash": "sha256-of-code",
  "dependencyHash": "sha256-of-connected-context",
  "provider": "openai",
  "modelName": "gpt-4o-mini",
  "result": {
    "summary": "Saves an order after validation",
    "purpose": "...",
    "stepByStep": [],
    "inputs": [],
    "outputs": [],
    "dependencies": []
  }
}
```

#### Selection Cache Reuse

```text
Selection inside function
        |
        v
Find latest compatible function explanation
        |
        v
Filter walkthrough / inputs / outputs by line range and identifiers
        |
        v
Render relevant subset without a new AI call
```

#### Tutorial Cache

```json
{
  "codeHash": "sha256-of-code",
  "language": "typescript",
  "tutorials": [
    {
      "identifier": "map",
      "summary": "Transforms array items into a new array.",
      "sources": []
    }
  ]
}
```

## Cache Flow

```text
User action
   |
   v
Build context
   |
   v
Compute code + dependency hash
   |
   v
Check cache
   |
 +-+----------------+
 |                  |
 v                  v
Hit                Miss
 |                  |
 v                  v
Return fast       Call provider
                    |
                    v
                 Save cache
                    |
                    v
                 Return explanation
```

## JSON Parsing Pipeline

Providers are instructed to return structured JSON, but KYC defensively handles imperfect model output.

```text
Raw response
   |
   v
Normalize text
remove markdown fences / HTML entities
   |
   v
Extract likely JSON object
   |
   v
Repair common JSON issues
   |
   v
Safe parse + normalize
   |
 +-+----------------+
 |                  |
 v                  v
Success            Failure
 |                  |
 v                  v
Structured UI      Fallback explanation
```

## Providers

KYC supports:

- OpenAI chat completions compatible endpoint
- Anthropic Claude Messages API
- Google Gemini Generate Content API
- Local Ollama-compatible generate endpoint

OpenAI, Claude, and Gemini provider implementations can consume streaming HTTP responses where available.

## API Key and Configuration Notes

KYC provides a **Set API Key** command and reads provider configuration from VS Code settings.

Important configuration keys:

| Setting | Purpose |
| --- | --- |
| `knowYourCode.activeProvider` | Default provider ID. |
| `knowYourCode.openai.enabled` | Enable OpenAI in picker. |
| `knowYourCode.openai.apiKey` | OpenAI API key. |
| `knowYourCode.openai.modelName` | Default OpenAI model. |
| `knowYourCode.claude.enabled` | Enable Claude in picker. |
| `knowYourCode.claude.apiKey` | Anthropic API key. |
| `knowYourCode.claude.modelName` | Default Claude model. |
| `knowYourCode.gemini.enabled` | Enable Gemini in picker. |
| `knowYourCode.gemini.apiKey` | Gemini API key. |
| `knowYourCode.gemini.modelName` | Default Gemini model. |
| `knowYourCode.localEnabled` | Enable local provider in picker. |
| `knowYourCode.localEndpoint` | Local provider endpoint. |
| `knowYourCode.localModelName` | Local model name. |
| `knowYourCode.cacheTtlSeconds` | Optional explanation cache TTL. |
| `knowYourCode.prefetchConnectedCalls` | Prefetch direct callees after a function explanation. |
| `knowYourCode.selectionDebounceMs` | Debounce/reuse window for repeated requests. |

Do not commit user-level VS Code settings that contain API keys.

## Tech Stack

- VS Code Extension API
- TypeScript
- Native VS Code Webview: HTML / CSS / browser JS
- sql.js for persistent cache storage
- VS Code document symbols / references
- Fetch-based OpenAI / Claude / Gemini / local providers
- `AbortController` for cancellation
- Browser `speechSynthesis` for TTS

## Performance Optimizations

- Content hashing
- Dependency hashing
- Provider/model-aware persistent cache
- Memory cache over repository lookups
- Selection-to-function cache reuse
- Tutorial function-to-selection reuse
- Direct callee prefetch
- Incremental explanation path for compatible edits
- Request abortion and superseding
- Debounced request and click handlers

## Development

### Build

```bash
npm run build
```

### Type-check

```bash
npm run lint
```

### Watch

```bash
npm run watch
```

### Test

```bash
npm test
```

### Run the Extension

1. Open this repository in VS Code.
2. Run `npm install`.
3. Run `npm run build`.
4. Press `F5`.
5. In the Extension Development Host, open a code file and run `KYC: Explain Function`.

## Repository Map

```text
src/
  extension.ts                         extension activation and command wiring
  cache/
    db.ts                              sql.js database lifecycle
    explanationRepo.ts                 explanation repository
    tutorialRepo.ts                    tutorial recommendation repository
    schema.ts                          DB schema
  commands/
    explainCurrentFunction.ts          function explanation command
    explainCurrentLine.ts              line explanation command
    explainCallFlow.ts                 call flow command
    refreshExplanation.ts              regenerate command
    runContextAction.ts                selection/context action runner
    showConnectedCalls.ts              connected-call snapshot command
    showContextActions.ts              context action picker
    setApiKey.ts                       provider API-key command
    switchProvider.ts                  model/provider switch command
  core/
    orchestrator.ts                    cache-aware AI orchestration
    codeReferences.ts                  source navigation and highlighting
    cacheReuse.ts                      function-to-selection reuse
    hierarchicalExplain.ts             parent/direct-child explanation flow
    responseParser.ts                  generic model response parsing
    activeRequest.ts                   cancellation state
    config.ts                          settings loader
    types.ts                           shared domain types
  context/
    actionRegistry.ts                  available context actions
    interactionContext.ts              cursor/selection context
  intelligence/
    symbolResolver.ts                  symbol, caller, callee resolution
    fingerprint.ts                     content/dependency hashes
    contextBuilder.ts                  provider input builder
  providers/
    openaiProvider.ts                  OpenAI provider
    claudeProvider.ts                  Claude provider
    geminiProvider.ts                  Gemini provider
    localProvider.ts                   local provider
    normalizeExplanation.ts            provider-output normalization
    promptBuilder.ts                   prompts
  tutorials/
    recommendations.ts                 built-in API tutorial detection
  ui/
    formatter.ts                       markdown response formatting
    panel.ts                           webview response panel
```

## Current Limitations

- The response panel is a native VS Code webview, not a React app.
- API keys are currently read from VS Code configuration.
- Code navigation works best for files that contributed references to the generated panel.
- TTS quality, voices, and availability depend on the VS Code webview runtime and operating system voices.

## Roadmap

- Bidirectional sync: code selection to explanation section
- Deeper interactive call graph visualization
- Multi-file dependency map panel
- Optional voice/rate/pitch settings panel
- Streaming formatted responses
- Live TTS for streamed responses
- Team-shared cache backend
- SecretStorage migration for API keys

## Conclusion

KYC is designed as a developer intelligence layer for VS Code:

- context-aware explanations
- fast cached reuse
- linked source navigation
- learning resources
- accessible listening controls
- cancellation and regeneration for day-to-day flow
