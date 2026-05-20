const test = require("node:test");
const assert = require("node:assert/strict");

const { parseTutorialScript, clampHighlightLines } = require("../dist/core/tutorialParser.js");

test("parseTutorialScript normalizes scenes and diagram", () => {
  const raw = JSON.stringify({
    title: "My Tutorial",
    audience: "beginner",
    summary: "Walkthrough of the handler.",
    scenes: [
      {
        id: "intro",
        title: "Intro",
        narration: "We start by validating input.",
        highlightLines: [5, 999],
        highlightIdentifiers: ["req"],
        takeaway: "Validation first."
      },
      {
        title: "Middle",
        narration: "Then we process.",
        highlightLines: [12]
      },
      {
        title: "SkippedScene",
        narration: ""
      }
    ],
    diagram: {
      type: "sequence",
      steps: [{ from: "Client", to: "API", label: "POST" }]
    },
    keyTakeaways: ["Auth matters"]
  });

  const script = parseTutorialScript(raw, {
    modelName: "test-model",
    lineRange: { startLine: 10, endLine: 20 }
  });

  assert.equal(script.title, "My Tutorial");
  assert.equal(script.scenes.length, 2);
  assert.equal(script.scenes[0].id, "intro");
  assert.deepEqual(script.scenes[0].highlightLines, [10, 20]);
  assert.ok(script.diagram);
  assert.equal(script.diagram.steps.length, 1);
  assert.deepEqual(script.keyTakeaways, ["Auth matters"]);
});

test("clampHighlightLines clips to range", () => {
  assert.deepEqual(
    clampHighlightLines([1, 15, 50], { startLine: 10, endLine: 20 }),
    [10, 15, 20]
  );
});

test("parseTutorialScript falls back on garbage input", () => {
  const script = parseTutorialScript("not json at all {{{", {
    lineRange: { startLine: 3, endLine: 8 }
  });
  assert.ok(script.scenes.length >= 1);
  assert.ok(script.scenes[0].narration.length > 0);
});
