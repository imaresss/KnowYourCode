import { ExplainFunctionInput, ExplainFunctionResult, StreamCallbacks, TokenUsage } from "../core/types";
import { ModelProvider } from "./modelProvider";
import { normalizeExplanationResult } from "./normalizeExplanation";
import { buildExplainFunctionPrompt } from "./promptBuilder";

interface AnthropicMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

export class ClaudeProvider implements ModelProvider {
  public readonly name = "claude";
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
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: this.modelName,
          max_tokens: 2048,
          stream: true,
          messages: [{ role: "user", content: prompt }]
        })
      });
    } catch {
      const err = new Error(`Unable to reach Claude API at ${this.endpoint}`);
      callbacks.onError(err);
      throw err;
    }

    if (!response.ok) {
      const body = (await response.text()).trim();
      const err = new Error(`Claude API error ${response.status}${body ? `: ${body}` : ""}`);
      callbacks.onError(err);
      throw err;
    }

    let accumulated = "";
    let inputTokens = 0;
    let outputTokens = 0;
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
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta?.text) {
              accumulated += event.delta.text;
              callbacks.onChunk(event.delta.text);
            }
            if (event.type === "message_start" && event.message?.usage) {
              inputTokens = event.message.usage.input_tokens ?? 0;
            }
            if (event.type === "message_delta" && event.usage) {
              outputTokens = event.usage.output_tokens ?? 0;
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (inputTokens > 0 || outputTokens > 0) {
      this.tokenUsage = {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens
      };
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
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: this.modelName,
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }]
        })
      });
    } catch {
      throw new Error(`fetch failed: unable to reach Claude API at ${this.endpoint}`);
    }

    if (!response.ok) {
      const body = (await response.text()).trim();
      throw new Error(`Claude API error ${response.status}${body ? `: ${body}` : ""}`);
    }

    return this.extractNonStreamResponse(response);
  }

  private async extractNonStreamResponse(response: Response): Promise<string> {
    const payload = (await response.json()) as AnthropicMessageResponse;
    if (payload.usage) {
      const input = payload.usage.input_tokens ?? 0;
      const output = payload.usage.output_tokens ?? 0;
      this.tokenUsage = {
        promptTokens: input,
        completionTokens: output,
        totalTokens: input + output
      };
    }
    const text = (payload.content ?? [])
      .filter((c) => c.type === "text" && Boolean(c.text))
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();

    if (!text) {
      throw new Error("Claude API returned empty response");
    }
    return text;
  }

  private parseResponse(text: string): ExplainFunctionResult {
    return normalizeExplanationResult(text);
  }

  private validateConfig(): void {
    if (!this.endpoint) { throw new Error("Claude endpoint is not configured."); }
    if (!this.apiKey) { throw new Error("Claude API key is not set. Use 'KYC: Set API Key' command."); }
  }
}
