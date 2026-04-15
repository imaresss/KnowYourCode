---
name: kyc-explain-callflow
description: Handle /kyc-explain-callflow prompts. Classifies calls as signal vs noise, then explains the flow with an optional sequence diagram.
---

# KYC — Explain Call Flow

When a message starts with `/kyc-explain-callflow`, follow these two steps.

## Step 1 — Silent call classification (never show to user)

Scan every call in the function body. Classify each as **signal** (explain it) or **noise** (discard it).

### Noise — discard
- Getters/accessors: `get*()`, `is*()`, `has*()` on data objects or entities
- Fluent/builder chains: `.stream()`, `.filter()`, `.map()`, `.collect()`, `.build()`, `.of()`, etc.
- String/collection stdlib: `.toString()`, `.isEmpty()`, `.size()`, `.contains()`, `.trim()`, etc.
- Logging: `log.*()`, `logger.*()`, `console.*()`, `System.out.*()`, `fmt.Print*()`
- Null/assertion utilities: `requireNonNull()`, `StringUtils.*()`, `assert*()`
- String formatting: `String.format()`, `fmt.Sprintf()`, f-strings
- Simple math/conversion: `Math.*()`, `parseInt()`, type casts

### Signal — include
- Calls on typed dependencies whose class or field name contains: `Service`, `Repo`, `Repository`, `Dao`, `Client`, `Manager`, `Handler`, `Processor`, `Provider`, `Gateway`, `Factory`, `Adapter`, `Controller`, `Broker`, `Publisher`, `Consumer`
- External I/O: HTTP clients, DB drivers, message queue producers, cache clients, file system writes
- Same-class business methods with meaningful verbs: `process*`, `save*`, `fetch*`, `validate*`, `publish*`, `execute*`, `handle*`, `resolve*`, etc.

### Ambiguous — use judgment
- If the receiver is a helper/utility (not a data entity, not stdlib), include if the method implies business logic
- When uncertain, lean toward including — a false positive is better than missing a real delegation

## Step 2 — Write the explanation

**Overview**
2–3 sentences: what this function does and the high-level sequence of calls it makes. If there are 4+ signal callees, identify the core delegation here — the one where the real business logic happens.

**For each signal callee** (in call order)
- What it does in this context
- What data flows between caller and callee (conceptually, no type lists)
- Why it is called at this point

If a signal callee is called inside a loop: note this explicitly — it affects performance and data volume.

If the function calls itself (recursion): do not treat the self-call as a normal callee; explain the base case and recursive path instead.

If calls form a method chain (`find().transform().save()`): treat as a pipeline — explain the transformation at each stage, not as individual callees.

**Sequence diagram** — draw one if EITHER is true:
- 3+ signal callees, OR
- Conditional branching (if/else, switch, try/catch) controls which callees are invoked

Mermaid `sequenceDiagram` rules:
- Name actors by class/object name, not variable name (`UserService` not `userService`)
- Keep call labels ≤8 words, action-oriented (`fetch user by ID`, `save updated record`)
- Use `alt` / `opt` for conditional paths — label each branch clearly
- For try/catch: always show the error path with `alt [success] / [failure]` — never omit the catch block
- If async (async/await, Promise, CompletableFuture, coroutine): mark async calls with a `<<async>>` note and show what the caller waits for before proceeding
- Show return values only when the returned data meaningfully affects the next step
- Caption below the diagram: describe the data or state transformation that occurs — not a restatement of the call sequence

**Side effects** — one sentence each, only if present:
- DB writes or deletes
- External API calls
- Events or messages published
- Cache mutations

**Zero signal callees**
If none found, write: "This function handles its logic directly without delegating to other services." Then 1 sentence on what it does (computation, transformation, validation, etc.).

## Hard rules — always apply

- No parameter type lists or method signatures
- No bullet lists of getters or accessors
- Reference line numbers only when they genuinely help orient the reader
- Explain idioms a developer from another language might not recognise, inline and briefly
- Plain prose for callees — not nested bullet points
