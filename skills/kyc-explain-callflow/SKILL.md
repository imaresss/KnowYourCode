---
name: kyc-explain-callflow
description: >-
  Handle /kyc-explain-callflow prompts from the Know Your Code extension.
  Use when a message starts with /kyc-explain-callflow. Explains the named
  function and its meaningful callees using a two-pass analysis: first classify
  real function calls vs noise, then explain with an optional sequence diagram
  for complex flows.
---

# KYC — Explain Call Flow

When a message starts with `/kyc-explain-callflow`, follow this two-step process.

---

## Step 1 — Silent call classification (do NOT show this to the user)

Scan every function/method call in the function body. Classify each as **signal** (explain it) or **noise** (discard it). Do not mention this classification in your response.

### Always noise — discard

- **Getters/accessors:** any call matching `get*()`, `is*()`, `has*()` on a data object or entity
- **Fluent/builder chains:** `.build()`, `.stream()`, `.filter()`, `.map()`, `.collect()`, `.toList()`, `.orElse()`, `.get()`, `.of()`, `.flatMap()`, `.reduce()`
- **String/collection stdlib:** `.toString()`, `.isEmpty()`, `.size()`, `.contains()`, `.equals()`, `.trim()`, `.split()`, `.join()`
- **Logging:** `log.*()`, `logger.*()`, `LOG.*()`, `console.*()`, `System.out.*()`, `print*()`, `fmt.Print*()`
- **Null/assertion/validation utilities:** `Objects.requireNonNull()`, `StringUtils.*()`, `CollectionUtils.*()`, `assert*()`, `assertEquals*()`
- **Language stdlib formatting:** `String.format()`, `fmt.Sprintf()`, `str.format()`, f-string equivalents
- **Simple math/conversion:** `Math.*()`, `Integer.parseInt()`, `Long.valueOf()`, type casts

### Always signal — include

- **Calls on typed service/repo/client dependencies** whose class or field name contains any of: `Service`, `Repo`, `Repository`, `Dao`, `Client`, `Manager`, `Handler`, `Processor`, `Provider`, `Gateway`, `Factory`, `Adapter`, `Controller`, `Broker`, `Publisher`, `Consumer`
- **External I/O calls:** HTTP clients (`restTemplate`, `httpClient`, `axios`, `fetch`), DB drivers, message queue producers (`kafkaProducer`, `rabbitTemplate`, `sqsClient`), cache clients (`redisTemplate`, `cacheManager`), file system operations beyond simple reads
- **Same-class business method calls** where the method name starts with a meaningful verb: `process*`, `send*`, `save*`, `create*`, `update*`, `delete*`, `fetch*`, `load*`, `validate*`, `generate*`, `publish*`, `notify*`, `execute*`, `handle*`, `build*` (when building a complex object, not a fluent builder), `resolve*`, `compute*`

### Ambiguous — use judgment

- If the receiver is a helper/utility class (not a data entity, not stdlib), include the call if the method name implies business logic
- When uncertain, lean toward **including** — a false positive is better than missing a real delegation

---

## Step 2 — Write the explanation

### Structure

**1. Overview**
2–3 sentences. What this function does and the high-level sequence of calls it makes.

**2. For each signal callee** (in the order they are called)
- What this callee does in the context of this function
- What data flows between the parent and the callee (conceptually — no parameter type lists)
- Why it is called at this point in the flow

**3. Sequence diagram** — draw one if EITHER condition is true:
- There are 3 or more signal callees, OR
- Conditional branching (if/else, switch, try/catch) controls which callees are called

**4. Side effects** — one sentence each, only if present:
- DB writes or deletes
- External API calls
- Events or messages published
- Cache mutations

### Sequence diagram format

Use Mermaid `sequenceDiagram` syntax.

```
sequenceDiagram
    participant FunctionName
    participant CalleeName1
    participant CalleeName2
    ...
```

Rules:
- Name actors by class or object name, not variable name (e.g. `UserService` not `userService`)
- Keep call labels to ≤ 8 words, action-oriented (e.g. `fetch user by ID`, `save updated record`)
- Use `alt` / `opt` blocks for conditional paths — label each branch clearly
- Show return values only when the returned data meaningfully affects the next step
- Add a plain-English caption below the diagram that explains the flow in 1–2 sentences — this caption should stand alone for someone new to the codebase

### Zero signal callees

If no signal callees are found, write:
> "This function doesn't delegate to other business logic."
Then give a 1-sentence description of what it does on its own (computation, transformation, validation, etc.).

---

## Hard rules — always apply

- No parameter type lists or method signatures
- No bullet lists of getters or accessors
- Reference line numbers only when they genuinely help orient the reader
- Explain idioms that a developer from another language might not recognise (inline, briefly)
- Plain prose for callees — not nested bullet points
