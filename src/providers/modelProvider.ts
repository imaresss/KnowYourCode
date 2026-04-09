import {
  ExplainFunctionInput,
  ExplainFunctionResult,
  ProviderRequestOptions,
  StreamCallbacks,
  TokenUsage
} from "../core/types";

export interface ModelProvider {
  readonly name: string;
  tokenUsage?: TokenUsage;
  explainFunction(input: ExplainFunctionInput, options?: ProviderRequestOptions): Promise<ExplainFunctionResult>;
  streamRaw?(prompt: string, callbacks: StreamCallbacks, options?: ProviderRequestOptions): Promise<string>;
}
