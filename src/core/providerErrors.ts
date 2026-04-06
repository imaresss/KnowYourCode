export function formatProviderError(error: unknown, mode: "local" | "cloud"): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("fetch failed")) {
    if (mode === "local") {
      return [
        "Local model request failed.",
        "Start your local model server and verify `knowYourCode.localEndpoint` and `knowYourCode.modelName`.",
        "Example for Ollama: run `ollama serve`, then ensure the model is pulled."
      ].join(" ");
    }

    return [
      "Cloud model request failed.",
      "Check `knowYourCode.cloudEndpoint`, your API key, and network access from the Extension Development Host."
    ].join(" ");
  }

  return message;
}
