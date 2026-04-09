import { ExplainFunctionInput, ExplainFunctionResult, ProviderRequestOptions, StreamCallbacks, TokenUsage } from "../core/types";
import { ModelProvider } from "./modelProvider";
import { normalizeExplanationResult } from "./normalizeExplanation";
import { buildExplainFunctionPrompt } from "./promptBuilder";
import { isAbortSignalError } from "./abort";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  error?: { message?: string; code?: number };
}

export class GeminiProvider implements ModelProvider {
  public readonly name = "gemini";
  public tokenUsage?: TokenUsage;

  public constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly modelName: string
  ) {}

  public async explainFunction(input: ExplainFunctionInput, options?: ProviderRequestOptions): Promise<ExplainFunctionResult> {
    const prompt = buildExplainFunctionPrompt(input);
    const text = await this.callApi(prompt, options);
    return this.parseResponse(text);
  }

  public async streamRaw(prompt: string, callbacks: StreamCallbacks, options?: ProviderRequestOptions): Promise<string> {
    this.validateConfig();
    const url = `${this.endpoint}/${this.modelName}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        signal: options?.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 }
        })
      });
    } catch (error) {
      if (isAbortSignalError(error)) {
        throw error;
      }
      const err = new Error(`Unable to reach Gemini API at ${this.endpoint}`);
      callbacks.onError(err);
      throw err;
    }

    if (!response.ok) {
      const body = (await response.text()).trim();
      const err = new Error(`Gemini API error ${response.status}${body ? `: ${body}` : ""}`);
      callbacks.onError(err);
      throw err;
    }

    let accumulated = "";
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await this.extractNonStreamResponse(await this.callApiRaw(prompt, options));
      callbacks.onChunk(text);
      callbacks.onDone();
      return text;
    }

    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { break; }

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) { continue; }
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") { continue; }

          try {
            const event = JSON.parse(data) as GeminiResponse;
            const text = event.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              accumulated += text;
              callbacks.onChunk(text);
            }
            if (event.usageMetadata) {
              this.tokenUsage = {
                promptTokens: event.usageMetadata.promptTokenCount ?? 0,
                completionTokens: event.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: event.usageMetadata.totalTokenCount ?? 0
              };
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    callbacks.onDone();
    return accumulated;
  }

  private async callApi(prompt: string, options?: ProviderRequestOptions): Promise<string> {
    const response = await this.callApiRaw(prompt, options);
    return this.extractNonStreamResponse(response);
  }

  private async callApiRaw(prompt: string, options?: ProviderRequestOptions): Promise<Response> {
    this.validateConfig();
    const url = `${this.endpoint}/${this.modelName}:generateContent?key=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        signal: options?.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 }
        })
      });
    } catch (error) {
      if (isAbortSignalError(error)) {
        throw error;
      }
      throw new Error(`fetch failed: unable to reach Gemini API at ${this.endpoint}`);
    }

    if (!response.ok) {
      const body = (await response.text()).trim();
      throw new Error(`Gemini API error ${response.status}${body ? `: ${body}` : ""}`);
    }

    return response;
  }

  private async extractNonStreamResponse(response: Response): Promise<string> {
    const payload = (await response.json()) as GeminiResponse;
    if (payload.error) {
      throw new Error(`Gemini API error: ${payload.error.message ?? "Unknown"}`);
    }

    if (payload.usageMetadata) {
      this.tokenUsage = {
        promptTokens: payload.usageMetadata.promptTokenCount ?? 0,
        completionTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: payload.usageMetadata.totalTokenCount ?? 0
      };
    }

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      throw new Error("Gemini API returned empty response");
    }
    return text;
  }

  private parseResponse(text: string): ExplainFunctionResult {
    return normalizeExplanationResult(text, {
      modelName: this.modelName,
      context: "gemini.explainFunction"
    });
  }

  private validateConfig(): void {
    if (!this.endpoint) { throw new Error("Gemini endpoint is not configured."); }
    if (!this.apiKey) { throw new Error("Gemini API key is not set. Use 'KYC: Set API Key' command."); }
  }
}
