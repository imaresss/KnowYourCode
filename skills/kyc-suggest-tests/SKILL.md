---

## name: kyc-suggest-tests
description: >-
  Handle /kyc-suggest-tests prompts. Produces a readable structured test plan
  with named cases grouped by scenario — no test code, only arrange and assert.

# KYC — Suggest Tests

When a message starts with `/kyc-suggest-tests`, follow these two steps.

## Step 1 — Silent analysis (never show to user)

Read the target function and assess:

- **Branches** — count `if`/`else`/`switch`/`ternary`/`catch` paths. More branches → richer Edge & Boundary and Error Cases sections.
- **External dependencies** — calls on types/fields whose names suggest `Service`, `Repo`, `Repository`, `Dao`, `Client`, `Manager`, `Handler`, `Processor`, `Provider`, `Gateway`, `Factory`, `Adapter`, `Controller`, `Broker`, `Publisher`, `Consumer`, or direct HTTP/DB/cache I/O. Any found → include **Mocking notes**.
- **Language and test framework** — infer from file extension, imports, annotations, package files, and nearby test naming conventions. If unclear, stay language-aware but framework-agnostic.
- **Function shape** — pure mapper/constructor with no logic → cap at 1–2 property-check cases and say so in the opening line.

### Language/framework detection hints

Use these as hints, not hard requirements. Prefer evidence from the current repo over generic defaults.


| Language                | Common signals                                                                                  | Likely test style                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| TypeScript / JavaScript | `.ts`, `.tsx`, `.js`, `.jsx`, `.test.`*, `.spec.*`, `jest`, `vitest`, `mocha`, `describe`, `it` | Jest, Vitest, Mocha, or framework-agnostic `describe/it` cases          |
| Python                  | `.py`, `test_*.py`, `*_test.py`, `pytest`, `unittest`, `def test_`                              | pytest or unittest                                                      |
| Java                    | `.java`, `@Test`, `org.junit`, `Mockito`, `AssertJ`, `Test.java`                                | JUnit 5/JUnit 4 with Mockito where dependencies exist                   |
| Go                      | `.go`, `_test.go`, `testing`, `t.Run`, `testify`                                                | Go `testing` package, table-driven tests when useful                    |
| Ruby                    | `.rb`, `_spec.rb`, `RSpec`, `Minitest`, `describe`, `it`                                        | RSpec or Minitest                                                       |
| Rust                    | `.rs`, `#[test]`, `mod tests`, `assert_eq!`, `Result`                                           | Rust unit tests with `#[test]`; property tests only when clearly useful |
| C                       | `.c`, `.h`, `cmocka`, `Unity`, `Check`, `assert`                                                | C unit tests, boundary and memory/error-path focused                    |
| C++                     | `.cpp`, `.cc`, `.cxx`, `.hpp`, `gtest`, `catch2`, `doctest`                                     | GoogleTest, Catch2, doctest, or framework-agnostic cases                |
| C#                      | `.cs`, `xUnit`, `NUnit`, `MSTest`, `[Fact]`, `[Test]`                                           | xUnit/NUnit/MSTest                                                      |
| PHP                     | `.php`, `PHPUnit`, `test*`, `*Test.php`                                                         | PHPUnit                                                                 |
| Kotlin                  | `.kt`, `kotlin.test`, JUnit annotations                                                         | JUnit/kotlin.test                                                       |
| Swift                   | `.swift`, `XCTest`, `func test`                                                                 | XCTest                                                                  |
| Scala                   | `.scala`, `ScalaTest`, `munit`, `specs2`                                                        | ScalaTest/munit/specs2                                                  |
| Dart                    | `.dart`, `package:test`, `flutter_test`                                                         | Dart test / Flutter test                                                |
| Elixir                  | `.ex`, `.exs`, `ExUnit`, `test "`                                                               | ExUnit                                                                  |
| R                       | `.R`, `testthat`, `test_that`                                                                   | testthat                                                                |


For any other renowned language, infer the ecosystem from local filenames/imports and keep the plan focused on observable behavior: inputs, outputs, side effects, errors, boundaries, and dependency interactions.

## Step 2 — Write the test plan (use this layout exactly)

**Readability is required.** Use short headings, numbered cases, and bullet lines — never dump the whole plan inside one code fence.

### Opening (always)

Start with:

```markdown
## Test plan: `<functionName>`

<One sentence: what this function does and what testing should focus on.>

**Framework:** <Jest / pytest / JUnit / RSpec / not detected — stay agnostic>
**Cases:** <N> total
```

Then a horizontal rule `---` before the first scenario section.

### Scenario sections (in order; skip empty ones)

Use `##` for each section title. Use **numbered** case titles (`### 1. …`, `### 2. …`) inside each section.


| Section              | When to include                                     |
| -------------------- | --------------------------------------------------- |
| `## Happy path`      | Always — 2–4 cases                                  |
| `## Edge & boundary` | Only if branches or input validation exist          |
| `## Error cases`     | Only if throws, error returns, or catch paths exist |
| `## Mocking notes`   | Only if external dependencies were found in Step 1  |


### Format for each test case (repeat for every case)

```markdown
### 1. <Short scenario title in plain English>

**When:** <input or trigger condition in one line>

- **Arrange:** <what to set up>
- **Assert:** <what to verify>

> **Async only:** Awaits `<what>` and resolves/rejects with `<outcome>`.
```

Rules for case titles:

- Use a clear scenario title — e.g. `Rejects expired token` — not a code-style `should …` string unless the project clearly uses that style (Jest/RSpec).
- Keep **When**, **Arrange**, and **Assert** on separate lines; never merge into one paragraph.
- Add a blank line between cases.

### Language-specific testing guidance

- **Java / C# / Kotlin / Scala:** include validation and exception cases; mention mocks for injected services/repositories/clients; note when equality/assertion style matters.
- **Python / Ruby / PHP:** include falsy/nil/null cases, monkeypatch/stub notes when external calls exist, and fixture setup when obvious from context.
- **Go:** prefer table-driven cases for many input/output combinations; include explicit error-return assertions and nil/zero-value boundaries.
- **TypeScript / JavaScript / Dart:** include async promise/future resolution and rejection cases; mention fake timers only when time-dependent logic exists.
- **Rust:** include `Result` `Ok`/`Err` paths, ownership/borrowing edge cases only when they affect behavior, and panic tests only when the function intentionally panics.
- **C / C++:** include pointer/null, buffer size, ownership/lifetime, allocation failure, bounds, and error-code cases when relevant.
- **Swift:** include optional/nil cases, throwing functions, async/await, and XCTest-style expected outcomes.
- **Elixir / functional languages:** include pattern-match branches, tagged tuple results, guard clauses, and process/message side effects when present.

### Mocking notes section (when included)

Use a simple bullet list — one dependency per bullet, two sub-bullets max:

```markdown
## Mocking notes

- **`UserService`**
  - Stub: return a valid user for ID `42`
  - Verify: `save` is called once with the updated profile
```

No import statements or setup boilerplate unless the framework was unambiguously detected in Step 1.

### Example of good output (follow this density and spacing)

```markdown
## Test plan: `processPayment`

Charges the order total and returns a payment confirmation. Focus on validation, gateway failures, and idempotency.

**Framework:** Jest (detected)
**Cases:** 6 total

---

## Happy path

### 1. Confirms payment for a valid order

**When:** Order has items, valid card, and positive total

- **Arrange:** Build an order with one line item and a mocked successful gateway response
- **Assert:** Returns `{ status: "confirmed", paymentId }` and persists the payment record

### 2. Applies discount before charging

**When:** Order includes an active coupon code

- **Arrange:** Order with subtotal 100 and coupon for 10% off; gateway expects amount 90
- **Assert:** Gateway is called with amount `90` and confirmation reflects discounted total

---

## Edge & boundary

### 3. Rejects zero-total order

**When:** Order total is `0`

- **Arrange:** Valid order shape with empty or zero-priced line items
- **Assert:** Validation error before any gateway call; no side effects

---

## Error cases

### 4. Surfaces gateway failure without double charge

**When:** Gateway returns a declined response

- **Arrange:** Mock gateway to reject; order otherwise valid
- **Assert:** User-facing error message; no confirmation stored; retry-safe (no duplicate charge on replay)

---

## Mocking notes

- **`PaymentGateway`**
  - Stub: success and failure responses per case
  - Verify: called at most once per attempt
```

---

## Hard rules — always apply

- **Cap at 12 test cases total** — prioritize highest-risk scenarios
- **No generic titles** — never "works", "does not crash", or "returns correct value" without naming the behavior
- **No test code** — plan only; user may ask Cursor to implement in a follow-up
- **No `@param` lists, no type signatures, no method signatures**
- **No single giant code block** wrapping the entire plan — only use fenced blocks if showing a tiny example snippet the user asked for
- **Constructor or pure mapper:** opening line notes that; then 1–2 cases under Happy path only
- **Infer language** from context; adapt case title style to the ecosystem

