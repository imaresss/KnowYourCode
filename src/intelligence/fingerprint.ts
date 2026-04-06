import { SymbolContext } from "../core/types";
import { sha256 } from "../utils/hash";

export function buildContentHash(context: SymbolContext): string {
  return sha256([
    context.symbolName,
    context.signature ?? "",
    context.code.trim()
  ].join("\n"));
}

export function buildDependencyHash(context: SymbolContext): string {
  const dependencyParts = [
    ...context.imports.map((item) => `import:${item}`),
    ...context.callers.map((item) => `caller:${item.name}:${item.signature ?? ""}`),
    ...context.callees.map((item) => `callee:${item.name}:${item.signature ?? ""}`),
    ...context.nearbySymbols.map((item) => `nearby:${item.name}:${item.signature ?? ""}`)
  ].sort();
  return sha256(dependencyParts.join("\n"));
}

export function buildSymbolKey(context: SymbolContext): string {
  if (context.symbolKeyHint) {
    return context.symbolKeyHint;
  }
  return [
    context.workspaceRoot,
    context.filePath,
    context.symbolName,
    context.range.startLine,
    context.range.endLine
  ].join("::");
}
