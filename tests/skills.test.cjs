const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const prompts = require("../dist/cursor/promptAssembler.js");
const { formatExplanationMarkdown } = require("../dist/ui/formatter.js");
const fixtures = require("./fixtures/skill-evaluations.json");
const skillsRoot = path.join(__dirname, "../skills");
const skillNames = fs.readdirSync(skillsRoot).filter(name => fs.statSync(path.join(skillsRoot, name)).isDirectory());

// The bundled skills deliberately use flat name/description frontmatter only.
// Validate this restricted YAML subset, rejecting malformed or extra fields.
function metadata(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, "frontmatter must have opening and closing delimiters");
  const fields = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const field = lines[i].match(/^(name|description):\s*(.+)$/);
    assert.ok(field, `invalid metadata: ${lines[i]}`);
    assert.ok(!Object.hasOwn(fields, field[1]), "duplicate metadata key");
    let value = field[2];
    if (value === ">-") {
      const parts = [];
      while (i + 1 < lines.length && /^  \S/.test(lines[i + 1])) parts.push(lines[++i].trim());
      value = parts.join(" ");
    } else if (value.startsWith('"')) value = JSON.parse(value);
    else assert.ok(!/[:#\[\]{}]/.test(value), "plain scalar must not contain YAML syntax");
    fields[field[1]] = value;
  }
  assert.match(fields.name, /^[a-z0-9-]+$/);
  assert.ok(typeof fields.description === "string" && fields.description.trim());
  return fields;
}

function context(fixture) {
  return {
    workspaceRoot: "/workspace/app", filePath: fixture.filePath, code: fixture.code,
    language: "typescript", symbolName: "target", symbolKind: "function",
    range: { startLine: 1, endLine: 2 }, callers: [], callees: [], imports: [], nearbySymbols: []
  };
}
function targetSnapshot(prompt) {
  const line = prompt.split("\n").find((line, i, all) => all[i - 1] === "Target snapshot (JSON data):");
  return JSON.parse(line);
}
function assertInstalled(prompt) {
  const skill = prompt.match(/^\/(\S+)/)?.[1];
  assert.ok(skillNames.includes(skill), `unbundled trigger: ${skill}`);
}

test("every bundled skill has valid matching metadata", () => {
  for (const name of skillNames) {
    assert.equal(metadata(fs.readFileSync(path.join(skillsRoot, name, "SKILL.md"), "utf8")).name, name);
  }
  assert.throws(() => metadata("---\n## name: broken\ndescription: example\n---\n"));
  assert.throws(() => metadata("---\nname: broken\ndescription: example\n"));
});

test("all handoff builders target installed skills and preserve supplied source", () => {
  for (const fixture of fixtures) {
    const ctx = context(fixture);
    for (const builder of [prompts.buildCursorExplainFunctionPrompt, prompts.buildCursorExplainCallFlowPrompt,
      prompts.buildCursorSuggestTestsPrompt, prompts.buildCursorExplainWithCalleesPrompt]) {
      const prompt = builder(ctx);
      assertInstalled(prompt);
      assert.deepEqual(targetSnapshot(prompt), { language: ctx.language, code: fixture.code });
    }
    const line = prompts.buildCursorExplainLinePrompt(ctx.filePath, ctx.language, fixture.code, 12, "outer", "surrounding code");
    assertInstalled(line);
    assert.equal(targetSnapshot(line).code, fixture.code);
  }
});

test("duplicate basenames retain distinguishable workspace paths", () => {
  const fixture = fixtures.find(f => f.id === "duplicate-filenames");
  const first = prompts.buildCursorExplainFunctionPrompt(context(fixture));
  const second = prompts.buildCursorExplainFunctionPrompt({ ...context(fixture), filePath: fixture.otherFilePath });
  assert.ok(first.includes(fixture.filePath));
  assert.ok(second.includes(fixture.otherFilePath));
  assert.notEqual(first, second);
});

test("partial selection preserves whitespace, backticks, language and exact coordinates", () => {
  const fixture = fixtures.find(f => f.id === "partial-selection");
  const prompt = prompts.buildCursorContextActionPrompt("explainSelectedCode", {
    ...context(fixture), mode: "selection", scope: "block", anchorLine: 11,
    sourceRange: fixture.sourceRange, enclosingFunction: { ...context(fixture), symbolName: "format" }
  });
  assertInstalled(prompt);
  assert.deepEqual(targetSnapshot(prompt), { language: "typescript", code: fixture.code });
  assert.ok(prompt.includes(JSON.stringify(fixture.sourceRange)));
  assert.ok(prompt.includes('Enclosing function: "format"'));
});

test("standalone rendering omits empty inventories but retains legacy content", () => {
  const result = { summary: "Doubles a value", purpose: "Returns twice the input", stepByStep: [], inputs: [], outputs: [], dependencies: [] };
  assert.doesNotMatch(formatExplanationMarkdown(result), /## (Inputs|Outputs|Dependencies)/);
  const legacy = formatExplanationMarkdown({ ...result, outputs: ["Saves the record"] });
  assert.match(legacy, /## Outputs/);
  assert.match(legacy, /Saves the record/);
});

test("editor selection reaches handoff without trimming or expanding to its enclosing function", async () => {
  const vm = require("node:vm");
  const fixture = fixtures.find(f => f.id === "partial-selection");
  const enclosing = { ...context(fixture), code: "function format() { /* surrounding code */ }", range: { startLine: 10, endLine: 20 } };
  const module = { exports: {} };
  const dependencies = {
    vscode: { Range: class { constructor(start, end) { this.start = start; this.end = end; } } },
    "../intelligence/contextBuilder": { buildExplainFunctionInput: () => ({ dependencyHash: "dep" }) },
    "../intelligence/fingerprint": { buildSymbolKey: () => "key" },
    "../intelligence/symbolResolver": { resolveEnclosingSymbolContext: async () => enclosing },
    "../utils/hash": require("../dist/utils/hash.js")
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../dist/context/interactionContext.js"), "utf8"), {
    module, exports: module.exports,
    require: name => { assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency ${name}`); return dependencies[name]; }
  });
  const selected = await module.exports.resolveInteractionContext({
    selection: { isEmpty: false, start: { line: 11, character: 2 }, end: { line: 12, character: 0 } },
    document: { uri: { fsPath: fixture.filePath }, languageId: "typescript", getText: () => fixture.code }
  });
  assert.equal(selected.code, fixture.code);
  assert.deepEqual(JSON.parse(JSON.stringify(selected.sourceRange)), fixture.sourceRange);
  assert.equal(selected.symbolContext, undefined);
  assert.equal(targetSnapshot(prompts.buildCursorContextActionPrompt("explainSelectedCode", selected)).code, fixture.code);
});

test("standalone call flow preserves implementation evidence and incremental explanation includes current code", () => {
  const { buildExplainCallFlowPrompt, buildIncrementalExplainPrompt } = require("../dist/providers/promptBuilder.js");
  const fixture = fixtures[0];
  const snippet = "async function write(v) {\n  await db.insert(v);\n  publish(v);\n}";
  const input = { ...context(fixture), callees: [{ name: "write", filePath: "/workspace/app/store.ts", snippet }] };
  assert.ok(buildExplainCallFlowPrompt(input).includes(snippet));
  const incremental = buildIncrementalExplainPrompt(input, { summary: "old", purpose: "old", stepByStep: [] }, {
    regionCount: 1, changedLines: 1, regions: [], unifiedDiff: "+ return false;"
  });
  assert.ok(incremental.includes(fixture.code));
});


test("handoffs distinguish roots with the same basename", () => {
  const firstContext = { ...context(fixtures[0]), workspaceRoot: "/work/client-a/app", filePath: "/work/client-a/app/src/index.ts" };
  const secondContext = { ...firstContext, workspaceRoot: "/work/client-b/app", filePath: "/work/client-b/app/src/index.ts" };
  for (const builder of [prompts.buildCursorExplainFunctionPrompt, prompts.buildCursorExplainCallFlowPrompt,
    prompts.buildCursorSuggestTestsPrompt, prompts.buildCursorExplainWithCalleesPrompt,
    ctx => prompts.buildCursorContextActionPrompt("explainSelectedCode", { ...ctx, anchorLine: 0, enclosingFunction: ctx })]) {
    const first = builder(firstContext);
    const second = builder(secondContext);
    assert.ok(first.includes(firstContext.filePath));
    assert.ok(second.includes(secondContext.filePath));
    assert.notEqual(first, second);
  }
});

test("selection cache rejects old prompt versions and respects config updates", () => {
  // Isolate editor/provider imports; this synchronous cache path only needs the repository.
  const vm = require("node:vm");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../dist/core/orchestrator.js"), "utf8"), {
    module, exports: module.exports, require: () => ({})
  });
  const stored = { explanationType: "explainFunction", contentHash: "unchanged", promptVersion: "v2", result: { summary: "cached" } };
  const orchestrator = new module.exports.ExplanationOrchestrator({ findLatestBySymbolKey: () => stored }, { promptVersion: "v3", cacheTtlSeconds: 0 });
  assert.equal(orchestrator.findCachedFunctionExplanation("symbol", "unchanged"), undefined);
  stored.promptVersion = "v3";
  assert.equal(orchestrator.findCachedFunctionExplanation("symbol", "unchanged").result, stored.result);
  assert.equal(orchestrator.findCachedFunctionExplanation("symbol", "changed"), undefined);
  orchestrator.updateConfig({ promptVersion: "v4", cacheTtlSeconds: 0 });
  assert.equal(orchestrator.findCachedFunctionExplanation("symbol", "unchanged"), undefined);
});
