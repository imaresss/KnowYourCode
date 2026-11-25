# Skill behavior evaluation

The cases in `fixtures/skill-evaluations.json` are a small manual model-evaluation set, separate from deterministic transport/metadata tests. `npm test` checks metadata, installed trigger mappings, exact snapshot preservation, file identity, and rendering; it does not grade model answers.

For each case, supply its code, file path, and any selection coordinates to each applicable KYC skill. Include `existingTest` as nearby test evidence when present. For the duplicate-filenames case, make both paths visible and verify that the requested path is used. Repeat the explanation with the standalone prompt when checking parity.

Score each answer against every `mustExplain` and `mustNotClaim` entry relevant to the chosen skill. Test plans should additionally use concrete outcomes, mark unit/integration level and risk, avoid duplicating supplied tests, and state when framework or coverage evidence is absent. Do not require exact wording or punish omission of a concept outside the skill's scope.

Record model/version, skill version or commit, input, response, failed criteria, and any follow-up correction. Accept a case only when all relevant criteria pass. Run these evaluations in a read-only sample workspace; no external calls or test execution are needed to explain the snippets.
