const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAvailableProviderRegistry,
  getSelectionId,
  resolveSelectedModel
} = require("../dist/providers/providerRegistry.js");

test("provider registry returns only enabled configured models", () => {
  const config = {
    activeProvider: "openai",
    providers: {
      openai: {
        enabled: true,
        apiKey: "sk-openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        modelName: "gpt-4o-mini"
      },
      claude: {
        enabled: true,
        apiKey: "",
        endpoint: "https://api.anthropic.com/v1/messages",
        modelName: "claude-sonnet"
      },
      gemini: {
        enabled: false,
        apiKey: "gemini-key",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
        modelName: "gemini-2.0-flash"
      }
    },
    localEnabled: true,
    localEndpoint: "http://127.0.0.1:11434/api/generate",
    localModelName: "qwen2.5-coder:7b",
    prefetchConnectedCalls: true,
    cacheTtlSeconds: 0,
    inlineActionsEnabled: true,
    selectionDebounceMs: 250,
    promptVersion: "v2"
  };

  const available = getAvailableProviderRegistry(config);
  const availableIds = available.map((entry) => `${entry.provider}:${entry.modelName}`);

  assert.ok(availableIds.includes("openai:gpt-4o-mini"));
  assert.ok(availableIds.includes("openai:gpt-4.1"));
  assert.ok(availableIds.includes("openai:o4-mini"));
  assert.ok(availableIds.includes("local:qwen2.5-coder:7b"));
  assert.equal(availableIds.some((value) => value.startsWith("claude:")), false);
  assert.equal(availableIds.some((value) => value.startsWith("gemini:")), false);
});

test("provider registry resolves selected model details", () => {
  const config = {
    activeProvider: "openai",
    providers: {
      openai: {
        enabled: true,
        apiKey: "sk-openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        modelName: "gpt-4o-mini"
      },
      claude: {
        enabled: true,
        apiKey: "claude-key",
        endpoint: "https://api.anthropic.com/v1/messages",
        modelName: "claude-sonnet-4-20250514"
      },
      gemini: {
        enabled: true,
        apiKey: "gemini-key",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
        modelName: "gemini-2.0-flash"
      }
    },
    localEnabled: false,
    localEndpoint: "",
    localModelName: "",
    prefetchConnectedCalls: true,
    cacheTtlSeconds: 0,
    inlineActionsEnabled: true,
    selectionDebounceMs: 250,
    promptVersion: "v2"
  };

  const entry = getAvailableProviderRegistry(config)[0];
  const selected = resolveSelectedModel(config, entry);

  assert.equal(getSelectionId(selected), "openai::gpt-4o-mini");
  assert.equal(selected.providerLabel, "OpenAI (ChatGPT)");
  assert.equal(selected.apiKey, "sk-openai");
});
