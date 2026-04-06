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
    explanationType: "function",
    contentHash: "content-1",
    dependencyHash: "deps-1",
    modelName: "test-model",
    providerMode: "local",
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
    providerMode: "local",
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
    explanationType: "function",
    contentHash: "content-1",
    dependencyHash: "deps-1",
    modelName: "test-model",
    providerMode: "local",
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
      providerMode: "local",
      promptVersion: "v1"
    }),
    undefined
  );

  db.close();
});
