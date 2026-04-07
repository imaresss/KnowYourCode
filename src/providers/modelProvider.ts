import { ExplainFunctionInput, ExplainFunctionResult, StreamCallbacks } from "../core/types";

export interface ModelProvider {
  readonly name: string;
  explainFunction(input: ExplainFunctionInput): Promise<ExplainFunctionResult>;
  streamRaw?(prompt: string, callbacks: StreamCallbacks): Promise<string>;
}
