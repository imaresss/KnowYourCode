import { ExplainFunctionInput, ExplainFunctionResult, StreamCallbacks, TokenUsage } from "../core/types";
import { ModelProvider } from "./modelProvider";
import { normalizeExplanationResult } from "./normalizeExplanation";
import { buildExplainFunctionPrompt } from "./promptBuilder";

interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
}

export class OpenAIProvider implements ModelProvider {
  public readonly name = "openai";
  public tokenUsage?: TokenUsage;

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

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          max_tokens: 2048,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: "system", content: "You are an expert code analyst. Respond with well-structured JSON." },
            { role: "user", content: prompt }
          ]
        })
      });
    } catch {
      const err = new Error(`Unable to reach OpenAI API at ${this.endpoint}`);
      callbacks.onError(err);
      throw err;
    }

    if (!response.ok) {
      const body = (await response.text()).trim();
      const err = new Error(`OpenAI API error ${response.status}${body ? `: ${body}` : ""}`);
      callbacks.onError(err);
      throw err;
    }

    let accumulated = "";
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await this.extractNonStreamResponse(response);
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
          if (data === "[DONE]") { continue; }

          try {
            const event = JSON.parse(data) as OpenAIResponse;
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              callbacks.onChunk(delta);
            }
            if (event.usage) {
              this.tokenUsage = {
                promptTokens: event.usage.prompt_tokens ?? 0,
                completionTokens: event.usage.completion_tokens ?? 0,
                totalTokens: event.usage.total_tokens ?? 0
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

  private async callApi(prompt: string): Promise<string> {
    this.validateConfig();

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          max_tokens: 2048,
          messages: [
            { role: "system", content: "You are an expert code analyst. Respond with well-structured JSON." },
            { role: "user", content: prompt }
          ]
        })
      });
    } catch {
      throw new Error(`fetch failed: unable to reach OpenAI API at ${this.endpoint}`);
    }

    if (!response.ok) {
      const body = (await response.text()).trim();
      throw new Error(`OpenAI API error ${response.status}${body ? `: ${body}` : ""}`);
    }

    return this.extractNonStreamResponse(response);
  }

  private async extractNonStreamResponse(response: Response): Promise<string> {
    const payload = (await response.json()) as OpenAIResponse;
    if (payload.usage) {
      this.tokenUsage = {
        promptTokens: payload.usage.prompt_tokens ?? 0,
        completionTokens: payload.usage.completion_tokens ?? 0,
        totalTokens: payload.usage.total_tokens ?? 0
      };
    }
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("OpenAI API returned empty response");
    }
    return text;
  }

  private parseResponse(text: string): ExplainFunctionResult {
    return normalizeExplanationResult(text);
  }

  private validateConfig(): void {
    if (!this.endpoint) { throw new Error("OpenAI endpoint is not configured."); }
    if (!this.apiKey) { throw new Error("OpenAI API key is not set. Use 'KYC: Set API Key' command."); }
  }
}
