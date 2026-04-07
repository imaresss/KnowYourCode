import { ExplainFunctionInput, ExplainFunctionResult, StreamCallbacks } from "../core/types";
import { ModelProvider } from "./modelProvider";
import { normalizeExplanationResult } from "./normalizeExplanation";
import { buildExplainFunctionPrompt } from "./promptBuilder";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; code?: number };
}

export class GeminiProvider implements ModelProvider {
  public readonly name = "gemini";

  public constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly modelName: string
  ) {}

  public async explainFunction(input: ExplainFunctionInput): Promise<ExplainFunctionResult> {
    const prompt = buildExplainFunctionPrompt(input);
    const text = await this.callApi(prompt);
    return this.parseResponse(text);
  }

  public async streamRaw(prompt: string, callbacks: StreamCallbacks): Promise<string> {
    this.validateConfig();
    const url = `${this.endpoint}/${this.modelName}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 }
        })
      });
    } catch {
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
      const text = await this.extractNonStreamResponse(await this.callApiRaw(prompt));
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
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    callbacks.onDone();
    return accumulated;
  }

  private async callApi(prompt: string): Promise<string> {
    const response = await this.callApiRaw(prompt);
    return this.extractNonStreamResponse(response);
  }

  private async callApiRaw(prompt: string): Promise<Response> {
    this.validateConfig();
    const url = `${this.endpoint}/${this.modelName}:generateContent?key=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 }
        })
      });
    } catch {
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
    return normalizeExplanationResult(text);
  }

  private validateConfig(): void {
    if (!this.endpoint) { throw new Error("Gemini endpoint is not configured."); }
    if (!this.apiKey) { throw new Error("Gemini API key is not set. Use 'KYC: Set API Key' command."); }
  }
}
