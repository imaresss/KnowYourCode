---
name: kyc-explain-function
description: >-
  Handle /kyc-explain-function prompts. Explains a function with depth
  calibrated to complexity — prose for simple, structured walkthrough for complex.
---

# KYC — Explain Function

When a message starts with `/kyc-explain-function`, follow these two steps.

## Step 1 — Silent complexity assessment (never show to user)

Rate the function LOW, MEDIUM, or HIGH:
- Lines: <15 → LOW · 15–50 → MEDIUM · >50 → HIGH
- Branches (if/else/switch/try-catch): >3 → bump up one level
- Nested loops: each → bump up one level
- External calls (API, DB, service, non-trivial methods): ≥2 → bump up one level
- Recursion present → bump up one level
- Java/C++: apply 0.7× multiplier to line count before rating

## Step 2 — Write the explanation

### LOW — plain prose, no headers
2–3 sentences: what it does, why it exists, key logic if non-obvious.

### MEDIUM — three paragraphs
**What it does** — 1–2 sentences.
**How it works** — 2–3 sentences on the main flow.
**Worth knowing** — up to 3 notes on non-obvious behavior: edge cases, side effects, patterns.

### HIGH — sectioned walkthrough (aim for under 200 words)
**Summary** — one sentence. Name the structural pattern if obvious (facade, factory, decorator, adapter).
**How it works** — break into logical blocks, 1–3 sentences each.
**Key logic paths** — main branches, loops, or error paths worth understanding.
**Worth knowing** — gotchas, side effects, or things to know before modifying.

## Hard rules — always apply

- If the function is a single line, write one sentence and stop
- If async (async/await, Promise, CompletableFuture, coroutine): always state what it waits for, what it returns, and whether errors can be swallowed — regardless of complexity tier
- If the function mutates external state (DB write, API call, shared object, event emit): always surface this — it is the most important thing a reader needs to know
- No parameter lists, no Inputs/Outputs/Dependencies sections
- Reference line numbers only when they genuinely help orient the reader
- If the language has idioms unfamiliar across languages, explain them briefly inline
- Adapt tone: plain for LOW, clear and structured for MEDIUM/HIGH
