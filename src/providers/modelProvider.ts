import { ExplainFunctionInput, ExplainFunctionResult } from "../core/types";

export interface ModelProvider {
  explainFunction(input: ExplainFunctionInput): Promise<ExplainFunctionResult>;
}
