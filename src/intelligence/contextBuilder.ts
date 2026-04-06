import { ExplainFunctionInput, SymbolContext } from "../core/types";
import { buildContentHash, buildDependencyHash } from "./fingerprint";

export function buildExplainFunctionInput(context: SymbolContext): ExplainFunctionInput {
  return {
    ...context,
    contentHash: buildContentHash(context),
    dependencyHash: buildDependencyHash(context)
  };
}
