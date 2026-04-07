import { ExplainFunctionInput, ExplainFunctionResult } from "../core/types";
import { ModelProvider } from "./modelProvider";
import { normalizeExplanationResult } from "./normalizeExplanation";
import { buildExplainFunctionPrompt } from "./promptBuilder";

export class LocalProvider implements ModelProvider {
  public readonly name = "local";

  public constructor(
    private readonly endpoint: string,
    private readonly modelName: string
  ) {}

  public async explainFunction(input: ExplainFunctionInput): Promise<ExplainFunctionResult> {
    const prompt = buildExplainFunctionPrompt(input);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
          format: "json"
        })
      });
    } catch {
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
    };
    const raw = payload.response ?? payload.output;
    if (!raw) {
      throw new Error("Local provider returned no response field");
    }

    if (typeof raw === "string") {
      try {
        return normalizeExplanationResult(JSON.parse(raw));
      } catch {
        return normalizeExplanationResult(raw);
      }
    }

    return normalizeExplanationResult(raw);
  }
}
