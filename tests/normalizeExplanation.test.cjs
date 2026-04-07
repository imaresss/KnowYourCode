const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeExplanationResult,
  parseJsonObjectFromModelText
} = require("../dist/providers/normalizeExplanation.js");

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

test("normalizer extracts JSON from markdown fences and prose (Claude-style)", () => {
  const raw = `Here is the analysis:

\`\`\`json
{
  "summary": "Axios interceptors",
  "purpose": "Handles auth globally",
  "stepByStep": ["Step one", "Step two"],
  "inputs": ["store"],
  "outputs": ["void"],
  "dependencies": ["axios"],
  "risks": ["race"],
  "connectedFlow": ["app -> axios"],
  "confidence": 0.9
}
\`\`\`
`;

  const result = normalizeExplanationResult(raw);
  assert.equal(result.summary, "Axios interceptors");
  assert.equal(result.stepByStep.length, 2);
  assert.equal(result.confidence, 0.9);
});

test("normalizer parses JSON after stray text and backticks (messy model output)", () => {
  const raw = `\`\`json
Purpose

\`json { "summary": "Test", "purpose": "P", "stepByStep": ["a","b"], "inputs": [], "outputs": [], "dependencies": [], "risks": [], "connectedFlow": [], "confidence": 0.92 }\`\``;

  const result = normalizeExplanationResult(raw);
  assert.equal(result.summary, "Test");
  assert.equal(result.purpose, "P");
  assert.deepEqual(result.stepByStep, ["a", "b"]);
  assert.equal(result.confidence, 0.92);
});

test("normalizer flattens object-shaped risks and dependencies", () => {
  const result = normalizeExplanationResult({
    summary: "S",
    purpose: "P",
    stepByStep: [],
    inputs: [{ name: "store", type: "object", purpose: "state" }],
    outputs: [{ type: "void", description: "side effects only" }],
    dependencies: [{ name: "axios", type: "library", usage: "HTTP" }],
    risks: [
      {
        category: "Error handling",
        risk: "logout may fail",
        severity: "high",
        fix: "add catch"
      }
    ],
    connectedFlow: [],
    confidence: 0.5
  });

  assert.match(result.inputs[0], /store/);
  assert.match(result.dependencies[0], /axios/);
  assert.match(result.risks[0], /Error handling/);
  assert.match(result.risks[0], /logout may fail/);
  assert.match(result.risks[0], /add catch/);
});

test("generic parser extracts JSON objects from wrapped model responses", () => {
  const raw = `Model output:\n\n\`\`\`json\n{ "overview": "Flow", "flowSteps": ["a"], "dataFlow": ["b"] }\n\`\`\``;
  const parsed = parseJsonObjectFromModelText(raw);

  assert.equal(parsed.overview, "Flow");
  assert.deepEqual(parsed.flowSteps, ["a"]);
});
