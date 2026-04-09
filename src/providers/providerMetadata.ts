import { AIProvider } from "../core/types";

export const PROVIDER_DISPLAY_NAMES: Record<AIProvider, string> = {
  openai: "OpenAI (ChatGPT)",
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  local: "Local (Ollama)"
};

export const ALL_PROVIDERS: AIProvider[] = ["openai", "claude", "gemini", "local"];

const OPENAI_MODELS = [
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini"
];

const CLAUDE_MODELS = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

const GEMINI_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b"
];

export function getProviderModels(provider: AIProvider, preferredModel?: string): string[] {
  const catalog = getBaseProviderModels(provider);
  if (!preferredModel?.trim()) {
    return catalog;
  }

  const trimmed = preferredModel.trim();
  return [trimmed, ...catalog.filter((model) => model !== trimmed)];
}

function getBaseProviderModels(provider: AIProvider): string[] {
  switch (provider) {
    case "openai":
      return OPENAI_MODELS;
    case "claude":
      return CLAUDE_MODELS;
    case "gemini":
      return GEMINI_MODELS;
    case "local":
      return [];
  }
}
