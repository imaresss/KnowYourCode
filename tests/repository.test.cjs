const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDatabase } = require("../dist/cache/db.js");
const { ExplanationRepository } = require("../dist/cache/explanationRepo.js");

async function createRepo() {
  const db = await createInMemoryDatabase();
  return {
    db,
    repo: new ExplanationRepository(db)
  };
}

test("repository stores and retrieves matching explanation records", async () => {
  const { db, repo } = await createRepo();

  repo.save({
    symbolKey: "/repo::/repo/app.ts::saveOrder::1::3",
    explanationType: "explainFunction",
    contentHash: "content-1",
    dependencyHash: "deps-1",
    modelName: "test-model",
    provider: "local",
    promptVersion: "v1",
    result: {
      summary: "Save order",
      purpose: "Stores order",
      stepByStep: [],
      inputs: [],
      outputs: [],
      dependencies: [],
      risks: [],
      connectedFlow: [],
      confidence: 0.8
    },
    createdAt: new Date().toISOString()
  });

  const found = repo.findValid({
    symbolKey: "/repo::/repo/app.ts::saveOrder::1::3",
    contentHash: "content-1",
    dependencyHash: "deps-1",
    modelName: "test-model",
    provider: "local",
    promptVersion: "v1"
  });

  assert.ok(found);
  assert.equal(found.result.summary, "Save order");

  db.close();
});

test("repository invalidates symbol explanations and call edges", async () => {
  const { db, repo } = await createRepo();
  const symbolKey = "/repo::/repo/app.ts::saveOrder::1::3";

  repo.save({
    symbolKey,
    explanationType: "explainFunction",
    contentHash: "content-1",
    dependencyHash: "deps-1",
    modelName: "test-model",
    provider: "local",
    promptVersion: "v1",
    result: {
      summary: "Save order",
      purpose: "Stores order",
      stepByStep: [],
      inputs: [],
      outputs: [],
      dependencies: [],
      risks: [],
      connectedFlow: [],
      confidence: 0.8
    },
    createdAt: new Date().toISOString()
  });

  repo.replaceCallEdges(symbolKey, [
    { name: "persist", filePath: "/repo/db.ts", signature: "persist(order)" }
  ]);

  assert.equal(repo.getCallEdges(symbolKey).length, 1);
  repo.invalidateSymbol(symbolKey);
  assert.equal(repo.getCallEdges(symbolKey).length, 0);
  assert.equal(
    repo.findValid({
      symbolKey,
      contentHash: "content-1",
      dependencyHash: "deps-1",
      modelName: "test-model",
      provider: "local",
      promptVersion: "v1"
    }),
    undefined
  );

  db.close();
});

test("repository getCacheStats returns provider breakdown", async () => {
  const { db, repo } = await createRepo();

  repo.save({
    symbolKey: "key-1",
    explanationType: "explainFunction",
    contentHash: "hash-1",
    dependencyHash: "dep-1",
    modelName: "gpt-4o-mini",
    provider: "openai",
    promptVersion: "v2",
    result: {
      summary: "Test",
      purpose: "Testing",
      stepByStep: [],
      inputs: [],
      outputs: [],
      dependencies: [],
      risks: [],
      connectedFlow: [],
      confidence: 0.9
    },
    createdAt: new Date().toISOString()
  });

  repo.save({
    symbolKey: "key-2",
    explanationType: "explainLine",
    contentHash: "hash-2",
    dependencyHash: "",
    modelName: "claude-haiku-4-5-20251001",
    provider: "claude",
    promptVersion: "v2",
    result: {
      lineExplanation: "Test line",
      whyItMatters: "Important",
      technicalDetail: "Details",
      relatedConcepts: ["testing"]
    },
    createdAt: new Date().toISOString()
  });

  const stats = repo.getCacheStats();
  assert.equal(stats.totalEntries, 2);
  assert.equal(stats.providers["openai"], 1);
  assert.equal(stats.providers["claude"], 1);

  db.close();
});

test("repository respects TTL and evicts expired cache entries", async () => {
  const { db, repo } = await createRepo();

  repo.save({
    symbolKey: "expired-key",
    explanationType: "explainFunction",
    contentHash: "hash-old",
    dependencyHash: "dep-old",
    modelName: "gpt-4o-mini",
    provider: "openai",
    promptVersion: "v2",
    result: {
      summary: "Expired",
      purpose: "Old cache entry",
      stepByStep: [],
      inputs: [],
      outputs: [],
      dependencies: [],
      risks: [],
      connectedFlow: [],
      confidence: 0.9
    },
    createdAt: new Date(Date.now() - 60_000).toISOString()
  });

  const found = repo.findValid({
    symbolKey: "expired-key",
    contentHash: "hash-old",
    dependencyHash: "dep-old",
    modelName: "gpt-4o-mini",
    provider: "openai",
    promptVersion: "v2"
  }, 1_000);

  assert.equal(found, undefined);

  db.close();
});

test("repository keeps separate cache entries for different models", async () => {
  const { db, repo } = await createRepo();
  const baseRecord = {
    symbolKey: "shared-key",
    explanationType: "explainFunction",
    contentHash: "hash-1",
    dependencyHash: "dep-1",
    provider: "openai",
    promptVersion: "v2",
    result: {
      summary: "Test",
      purpose: "Testing",
      stepByStep: [],
      inputs: [],
      outputs: [],
      dependencies: [],
      risks: [],
      connectedFlow: [],
      confidence: 0.9
    },
    createdAt: new Date().toISOString()
  };

  repo.save({
    ...baseRecord,
    modelName: "gpt-4o-mini"
  });

  repo.save({
    ...baseRecord,
    modelName: "gpt-4.1-mini"
  });

  const gpt4o = repo.findValid({
    symbolKey: "shared-key",
    contentHash: "hash-1",
    dependencyHash: "dep-1",
    modelName: "gpt-4o-mini",
    provider: "openai",
    promptVersion: "v2"
  });
  const gpt41 = repo.findValid({
    symbolKey: "shared-key",
    contentHash: "hash-1",
    dependencyHash: "dep-1",
    modelName: "gpt-4.1-mini",
    provider: "openai",
    promptVersion: "v2"
  });

  assert.ok(gpt4o);
  assert.ok(gpt41);
  assert.equal(gpt4o.modelName, "gpt-4o-mini");
  assert.equal(gpt41.modelName, "gpt-4.1-mini");

  db.close();
});
