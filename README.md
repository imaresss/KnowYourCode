# KYC — Know Your Code

A production-ready VS Code extension that helps developers understand code deeply by leveraging multiple AI models (OpenAI, Claude, Gemini) with intelligent caching to reduce token usage and improve performance.

## Features

### Code Intelligence Actions
- **Explain Function** — Deep, beginner-friendly explanation of the function at your cursor
- **Explain Line** — Focused explanation of a single line of code
- **Explain Call Flow** — Trace execution flow through callers and callees
- **Show Connected Calls** — Visualize the call graph around the current function
- **Regenerate Explanation** — Force a fresh AI call, bypassing cache

### Multi-Provider AI Support
- **OpenAI** (GPT-4o, GPT-4o-mini, etc.)
- **Claude** (Anthropic — Haiku, Sonnet, Opus)
- **Gemini** (Google — Flash, Pro)
- **Local** (Ollama or any compatible API)

Switch between providers dynamically without restarting.

### Smart Caching System
- SHA-256 content hashing for cache uniqueness
- SQLite-backed persistent cache (via sql.js)
- Caches: code snippet, explanation, provider, model, timestamp
- Automatic cache invalidation on file save
- Content + dependency hash tracking for precise invalidation
- Offline mode using cached results

### Rich Webview UI
- Modern, theme-aware explanation panel
- Copy explanation to clipboard
- Regenerate with one click
- Switch AI provider from the panel
- Loading spinner during AI calls
- Confidence indicator with visual bar

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Launch Extension

Press `F5` in VS Code to open an Extension Development Host.

### 4. Configure an AI Provider

Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

```
KYC: Set API Key
```

Select a provider and enter your API key. Or configure via Settings:

| Setting | Default |
|---------|---------|
| `knowYourCode.activeProvider` | `openai` |
| `knowYourCode.openai.apiKey` | *(empty)* |
| `knowYourCode.openai.modelName` | `gpt-4o-mini` |
| `knowYourCode.claude.apiKey` | *(empty)* |
| `knowYourCode.claude.modelName` | `claude-haiku-4-5-20251001` |
| `knowYourCode.gemini.apiKey` | *(empty)* |
| `knowYourCode.gemini.modelName` | `gemini-2.0-flash` |

### 5. Explain Some Code

Place your cursor inside a function and:
- Right-click → **KYC: Explain Function**
- Or use `Cmd+Shift+E` / `Ctrl+Shift+E`
- Or open the command palette → **KYC: Explain Function**

---

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| KYC: Explain Function | `Cmd+Shift+E` | Explain the function at cursor |
| KYC: Explain Line | `Cmd+Shift+L` | Explain the current line |
| KYC: Explain Call Flow | `Cmd+Shift+F` | Trace execution flow |
| KYC: Regenerate Explanation | — | Force fresh AI call |
| KYC: Show Connected Calls | — | View callers/callees graph |
| KYC: Switch AI Provider | — | Change active provider |
| KYC: Set API Key | — | Configure provider API key |

All explain commands are also available via right-click context menu.

---

## Architecture

```
src/
├── extension.ts                 # Entry point — wires commands, lifecycle
├── cache/
│   ├── db.ts                    # SQLite database (sql.js) with persistence
│   ├── explanationRepo.ts       # CRUD operations for cached explanations
│   └── schema.ts                # DDL for explanations + call_edges tables
├── commands/
│   ├── explainCurrentFunction.ts
│   ├── explainCurrentLine.ts
│   ├── explainCallFlow.ts
│   ├── refreshExplanation.ts
│   ├── showConnectedCalls.ts
│   ├── switchProvider.ts
│   └── setApiKey.ts
├── core/
│   ├── config.ts                # Multi-provider configuration
│   ├── types.ts                 # All TypeScript interfaces
│   ├── orchestrator.ts          # Cache-aware AI call orchestration
│   ├── providerErrors.ts        # User-friendly error messages
│   └── fallbackExplanation.ts   # Heuristic fallback when AI fails
├── intelligence/
│   ├── symbolResolver.ts        # AST/symbol resolution via VS Code APIs
│   ├── fingerprint.ts           # Content + dependency hashing
│   └── contextBuilder.ts        # Build AI input from symbol context
├── providers/
│   ├── modelProvider.ts         # Provider interface
│   ├── openaiProvider.ts        # OpenAI chat completions + streaming
│   ├── claudeProvider.ts        # Anthropic Messages API + streaming
│   ├── geminiProvider.ts        # Google Gemini API + streaming
│   ├── localProvider.ts         # Ollama/local model API
│   ├── providerFactory.ts       # Provider creation + registry
│   ├── promptBuilder.ts         # AI prompt templates
│   └── normalizeExplanation.ts  # Parse/normalize AI responses
├── ui/
│   ├── panel.ts                 # Rich webview panel
│   └── formatter.ts             # Markdown formatters
├── utils/
│   ├── hash.ts                  # SHA-256 utility
│   └── logger.ts                # Output channel logger
└── types/
    └── sql-js.d.ts              # sql.js type declarations
```

---

## Caching Strategy

```
User requests explanation
        │
        ▼
  Hash code content (SHA-256)
        │
        ▼
  Look up cache by:
    symbol_key + content_hash + dependency_hash
    + model_name + provider + prompt_version
        │
        ├── Cache HIT  → Return instantly (0 API cost)
        │
        └── Cache MISS → Call AI provider
                │
                ▼
          Store result in SQLite
                │
                ▼
          Return explanation
```

Cache is invalidated:
- On file save (all entries for that file)
- On code change (content hash mismatch)
- On dependency change (dependency hash mismatch)
- On provider/model switch (different cache key)
- Manually via "Regenerate Explanation"

---

## Sample AI Prompt

The prompt sent to AI providers includes:

```
You are a senior code analyst explaining code to developers of all experience levels.
Your explanations must be:
  1. Accurate and technically precise
  2. Accessible to beginners (avoid jargon without definition)
  3. Comprehensive (cover purpose, logic, edge cases)
  4. Actionable (help the reader understand AND modify the code confidently)

Return ONLY valid JSON with keys:
  summary, purpose, stepByStep, inputs, outputs,
  dependencies, risks, connectedFlow, confidence

--- CODE CONTEXT ---
Function: saveOrder
Language: typescript
File: /src/services/orderService.ts
Signature: async saveOrder(order: Order): Promise<Order>
...
Callers:
  - handleCheckout | async handleCheckout(req, res)
Callees:
  - validateOrder | validateOrder(order: Order): boolean
  - persist | persist(order: Order): Promise<Order>

--- FUNCTION CODE ---
async saveOrder(order: Order): Promise<Order> {
  ...
}
```

---

## Streaming Support

OpenAI, Claude, and Gemini providers support Server-Sent Events (SSE) streaming. When available, the extension streams raw text to the panel in real-time, then renders the formatted result on completion.

---

## Running Tests

```bash
npm test
```

Tests cover:
- Content/dependency hashing and fingerprinting
- AI response normalization (structured JSON + plain text fallback)
- Repository CRUD, invalidation, and cache statistics

---

## Development

```bash
npm run watch   # TypeScript watch mode
```

Press `F5` to launch the Extension Development Host. The extension reloads on rebuild.

---

## License

Private — not published to marketplace yet.
