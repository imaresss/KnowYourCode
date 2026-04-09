import { ExplainFunctionInput, ExplainFunctionResult, ProviderRequestOptions, TokenUsage } from "../core/types";
import { ModelProvider } from "./modelProvider";
import { normalizeExplanationResult } from "./normalizeExplanation";
import { buildExplainFunctionPrompt } from "./promptBuilder";
import { isAbortSignalError } from "./abort";

export class LocalProvider implements ModelProvider {
  public readonly name = "local";
  public tokenUsage?: TokenUsage;

  public constructor(
    private readonly endpoint: string,
    private readonly modelName: string
  ) {}

  public async explainFunction(input: ExplainFunctionInput, options?: ProviderRequestOptions): Promise<ExplainFunctionResult> {
    const prompt = buildExplainFunctionPrompt(input);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        signal: options?.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
          format: "json"
        })
      });
    } catch (error) {
      if (isAbortSignalError(error)) {
        throw error;
      }
      throw new Error(
        `fetch failed: unable to reach local provider at ${this.endpoint} for model ${this.modelName}`
      );
    }

    if (!response.ok) {
      throw new Error(`Local provider request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      response?: string;
      output?: unknown;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const promptTokens = payload.prompt_eval_count ?? 0;
    const completionTokens = payload.eval_count ?? 0;
    if (promptTokens > 0 || completionTokens > 0) {
      this.tokenUsage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      };
    }
    const raw = payload.response ?? payload.output;
    if (!raw) {
      throw new Error("Local provider returned no response field");
    }

    if (typeof raw === "string") {
      try {
        return normalizeExplanationResult(JSON.parse(raw), {
          modelName: this.modelName,
          context: "local.explainFunction"
        });
      } catch {
        return normalizeExplanationResult(raw, {
          modelName: this.modelName,
          context: "local.explainFunction"
        });
      }
    }

    return normalizeExplanationResult(raw, {
      modelName: this.modelName,
      context: "local.explainFunction"
    });
  }
}
