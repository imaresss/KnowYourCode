const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildContentHash,
  buildDependencyHash,
  buildSymbolKey
} = require("../dist/intelligence/fingerprint.js");

test("content hash changes when function body changes", () => {
  const base = {
    workspaceRoot: "/repo",
    filePath: "/repo/app.ts",
    language: "typescript",
    symbolName: "saveOrder",
    symbolKind: "function",
    signature: "function saveOrder(order) {",
    range: { startLine: 1, endLine: 3 },
    code: "function saveOrder(order) {\n  return order.id;\n}",
    imports: [],
    callers: [],
    callees: [],
    nearbySymbols: []
  };

  const original = buildContentHash(base);
  const changed = buildContentHash({
    ...base,
    code: "function saveOrder(order) {\n  return order.status;\n}"
  });

  assert.notEqual(original, changed);
});

test("dependency hash changes when callees change", () => {
  const base = {
    workspaceRoot: "/repo",
    filePath: "/repo/app.ts",
    language: "typescript",
    symbolName: "saveOrder",
    symbolKind: "function",
    signature: "function saveOrder(order) {",
    range: { startLine: 1, endLine: 3 },
    code: "function saveOrder(order) {\n  return persist(order);\n}",
    imports: ["import { persist } from './db';"],
    callers: [],
    callees: [{ name: "persist", filePath: "/repo/db.ts", signature: "persist(order)" }],
    nearbySymbols: []
  };

  const original = buildDependencyHash(base);
  const changed = buildDependencyHash({
    ...base,
    callees: [{ name: "publish", filePath: "/repo/bus.ts", signature: "publish(order)" }]
  });

  assert.notEqual(original, changed);
});

test("symbol key uses explicit symbolKeyHint when available", () => {
  const key = buildSymbolKey({
    workspaceRoot: "/repo",
    filePath: "/repo/app.ts",
    language: "typescript",
    symbolName: "saveOrder",
    symbolKind: "function",
    signature: "function saveOrder(order) {",
    symbolKeyHint: "custom-key",
    range: { startLine: 1, endLine: 3 },
    code: "function saveOrder(order) {}",
    imports: [],
    callers: [],
    callees: [],
    nearbySymbols: []
  });

  assert.equal(key, "custom-key");
});
