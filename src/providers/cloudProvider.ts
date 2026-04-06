import { ExplainFunctionInput, ExplainFunctionResult } from "../core/types";
import { ModelProvider } from "./modelProvider";
import { normalizeExplanationResult } from "./normalizeExplanation";
import { buildExplainFunctionPrompt } from "./promptBuilder";

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    type?: string;
    message?: string;
  };
}

export class CloudProvider implements ModelProvider {
  public constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly modelName: string
  ) {}

  public async explainFunction(input: ExplainFunctionInput): Promise<ExplainFunctionResult> {
    const prompt = buildExplainFunctionPrompt(input);
    if (!this.endpoint) {
      throw new Error("Cloud provider endpoint is empty.");
    }
    if (!this.apiKey) {
      throw new Error("Cloud provider API key is empty.");
    }

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
          max_tokens: 1200,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });
    } catch {
      throw new Error(`fetch failed: unable to reach cloud provider at ${this.endpoint}`);
    }

    if (!response.ok) {
      const errorBody = (await response.text()).trim();
      throw new Error(
        `Cloud provider request failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`
      );
    }

    const payload = (await response.json()) as AnthropicMessageResponse;
    const textContent = (payload.content ?? [])
      .filter((item) => item.type === "text" && Boolean(item.text))
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();

    if (!textContent) {
      throw new Error("Cloud provider returned no output field");
    }

    try {
      return normalizeExplanationResult(JSON.parse(textContent));
    } catch {
      return normalizeExplanationResult(textContent);
    }
  }
}
