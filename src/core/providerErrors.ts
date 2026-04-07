import { AIProvider } from "./types";

export function formatProviderError(error: unknown, provider: AIProvider): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("API key is not set")) {
    return `${providerLabel(provider)} API key is not configured. Run "KYC: Set API Key" from the command palette.`;
  }

  if (message.includes("fetch failed") || message.includes("Unable to reach")) {
    switch (provider) {
      case "local":
        return [
          "Local model request failed.",
          "Start your local model server and verify `knowYourCode.localEndpoint` and `knowYourCode.localModelName`.",
          "Example for Ollama: run `ollama serve`, then ensure the model is pulled."
        ].join(" ");
      default:
        return `${providerLabel(provider)} request failed. Check your API key, endpoint settings, and network access.`;
    }
  }

  if (message.includes("401") || message.includes("403")) {
    return `${providerLabel(provider)} authentication failed. Verify your API key is correct and has sufficient permissions.`;
  }

  if (message.includes("429")) {
    return `${providerLabel(provider)} rate limit exceeded. Please wait a moment and try again.`;
  }

  return `${providerLabel(provider)}: ${message}`;
}

function providerLabel(provider: AIProvider): string {
  const labels: Record<AIProvider, string> = {
    openai: "OpenAI",
    claude: "Claude",
    gemini: "Gemini",
    local: "Local model"
  };
  return labels[provider] ?? provider;
}
