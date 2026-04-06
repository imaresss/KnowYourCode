const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeExplanationResult } = require("../dist/providers/normalizeExplanation.js");

test("normalizer preserves structured JSON responses", () => {
  const result = normalizeExplanationResult({
    summary: "Saves the order",
    purpose: "Writes the order to storage",
    stepByStep: ["Validate input", "Call repository"],
    inputs: ["order"],
    outputs: ["saved order"],
    dependencies: ["orderRepository"],
    risks: ["repository may throw"],
    connectedFlow: ["controller -> service -> repository"],
    confidence: 0.91
  });

  assert.equal(result.summary, "Saves the order");
  assert.equal(result.stepByStep.length, 2);
  assert.equal(result.confidence, 0.91);
});

test("normalizer falls back for plain text responses", () => {
  const result = normalizeExplanationResult("This function validates and saves the order.");

  assert.match(result.summary, /This function validates and saves the order/);
  assert.equal(result.purpose, "This function validates and saves the order.");
  assert.equal(result.confidence, 0.35);
});
