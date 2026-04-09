import { ExplainFunctionInput, ExplainFunctionResult, StreamCallbacks, TokenUsage } from "../core/types";

export interface ModelProvider {
  readonly name: string;
  tokenUsage?: TokenUsage;
  explainFunction(input: ExplainFunctionInput): Promise<ExplainFunctionResult>;
  streamRaw?(prompt: string, callbacks: StreamCallbacks): Promise<string>;
}
