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
- Switch AI model from the panel
- Loading spinner during AI calls

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

Select a provider (OpenAI/Claude/Gemini) and enter your API key.

After API key setup:
- KYC auto-picks your **default model** for each explain action.
- You do **not** need to select a model every time.
- If you want to change the default model, run **KYC: Switch AI Model**.

You can also configure defaults in Settings:

| Setting | Default |
|---------|---------|
| `knowYourCode.activeProvider` | `openai` |
| `knowYourCode.openai.apiKey` | *(empty)* |
| `knowYourCode.openai.modelName` | `gpt-4o-mini` |
| `knowYourCode.claude.apiKey` | *(empty)* |
| `knowYourCode.claude.modelName` | `claude-haiku-4-5-20251001` |
| `knowYourCode.gemini.apiKey` | *(empty)* |
| `knowYourCode.gemini.modelName` | `gemini-2.0-flash` |

### 5. Explain Code

Place your cursor inside a function and:
- Right-click → **KYC: Explain Function**
- Or use `Cmd+Shift+E` / `Ctrl+Shift+E`
- Or open the command palette → **KYC: Explain Function**

Other explain options:
- **KYC: Explain Line** for the current line
- **KYC: Explain Call Flow** for call-chain analysis
- **KYC: Show Context Actions** to run selection-based actions

### 6. Change Default Model (Optional)

Run:

```
KYC: Switch AI Model
```

Then pick provider + model. KYC saves this as your default and uses it for future explain actions.

### 7. Regenerate Fresh Output

- Click **Regenerate** in the panel, or run **KYC: Regenerate Explanation**
- Regenerate always makes a fresh AI call (bypasses cache)

---

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| KYC: Explain Function | `Cmd+Shift+E` | Explain the function at cursor |
| KYC: Explain Line | `Cmd+Shift+L` | Explain the current line |
| KYC: Explain Call Flow | `Cmd+Shift+F` | Trace execution flow |
| KYC: Regenerate Explanation | — | Force fresh AI call |
| KYC: Show Connected Calls | — | View callers/callees graph |
| KYC: Switch AI Model | — | Change default provider/model |
| KYC: Set API Key | — | Configure provider API key |

All explain commands are also available via right-click context menu.

---

## Usage Reference

### Explain Actions
- **KYC: Explain Function** - Explains the function/method at cursor with summary, purpose, steps, inputs, outputs, and dependencies.
- **KYC: Explain Line** - Explains only the current line in context of the enclosing function.
- **KYC: Explain Call Flow** - Describes execution flow, data flow, entry/exit points, and side effects.
- **KYC: Show Context Actions** - Opens selection-aware actions such as explain selected code, summarize selection, find issues, and optimize function.
- **KYC: Run Context Action** - Internal command used by context actions (normally triggered through Show Context Actions).
- **KYC: Show Connected Calls** - Shows callers, callees, and cached call graph links for the current function.

### Model and Provider Actions
- **KYC: Set API Key** - First setup step for OpenAI, Claude, or Gemini. If API key is missing, KYC prompts you to set it.
- **KYC: Switch AI Model** - Lets you choose provider + model and saves it as your default model.
- **Default model behavior** - Once a default is set, KYC uses it automatically for explain actions (no repeated model prompt).
- **Default marker in picker** - In model list, the default entry is shown with `Default` before the model name.

### Regenerate and Cache
- **KYC: Regenerate Explanation** - Always runs a fresh AI call for the last explanation context (bypasses cache).
- **Panel cache badges**:
  - `Cached (ModelName)` = result returned from cache
  - `Generated (ModelName)` = freshly generated from provider API

### Explanation Panel Buttons
- **Copy** - Copies current explanation text.
- **Regenerate** - Same behavior as regenerate command (fresh call).
- **Switch Model** - Re-runs the same last explanation using a new model and updates default model.

### Key Settings (`knowYourCode.*`)
- **Provider defaults**
  - `activeProvider`
  - `openai.modelName`
  - `claude.modelName`
  - `gemini.modelName`
  - `localModelName`
- **API keys**
  - `openai.apiKey`
  - `claude.apiKey`
  - `gemini.apiKey`
- **Enable/disable providers**
  - `openai.enabled`
  - `claude.enabled`
  - `gemini.enabled`
  - `localEnabled`
- **Endpoints**
  - `openai.endpoint`
  - `claude.endpoint`
  - `gemini.endpoint`
  - `localEndpoint`
- **Performance and UX**
  - `cacheTtlSeconds`
  - `prefetchConnectedCalls`
  - `selectionDebounceMs`
  - `inlineActionsEnabled`

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
  summary, purpose, stepByStep, inputs, outputs, dependencies

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
