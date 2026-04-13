---
name: kyc-explain-function
description: >-
  Handle /kyc-explain-function prompts from the Know Your Code extension.
  Use when a message starts with /kyc-explain-function. Explains the named
  function with depth calibrated to its complexity — prose for simple functions,
  structured walkthrough for complex ones.
---

# KYC — Explain Function

When a message starts with `/kyc-explain-function`, follow this two-step process.

---

## Step 1 — Silent complexity assessment (do NOT show this to the user)

Assess the function on these signals and assign a rating of LOW, MEDIUM, or HIGH:

| Signal | Rule |
|--------|------|
| Line count | `< 15` → leans LOW · `15–50` → leans MEDIUM · `> 50` → leans HIGH |
| Branches (if/else/switch/try-catch) | More than 3 in a short function → bump up one level |
| Nested loops | Each nested loop → bump up one level |
| External calls (API, DB, service, non-trivial method calls) | 2 or more → bump up one level |
| Language verbosity | Java/C++ are verbose — apply a 0.7× multiplier to the line count before classifying |

Pick the final rating, then go to Step 2. Do not mention the rating or this assessment in your response.

---

## Step 2 — Write the explanation

Use the format that matches the complexity rating.

### LOW — plain prose, no headers

Write 2–3 sentences. Cover: what it does, why it exists, and one note on the key logic if non-obvious. No bullet points, no headers, no parameter lists.

### MEDIUM — three short paragraphs, light headers

**What it does**
1–2 sentences.

**How it works**
2–3 sentences covering the main flow in plain language.

**Worth knowing**
One note on anything non-obvious — an edge case, a side effect, a pattern worth naming.

### HIGH — sectioned walkthrough

**Summary**
One sentence.

**How it works**
Break the function into its logical blocks. Explain each block in 1–3 sentences. Reference line numbers where they genuinely help orient the reader.

**Key logic paths**
Describe what happens in the main branches or conditions (the interesting if/else, loops, or error paths).

**Worth knowing**
Gotchas, side effects, or patterns a developer should be aware of when reading or modifying this function.

---

## Hard rules — always apply

- No Inputs / Outputs / Dependencies sections anywhere
- No bullet lists of parameters
- Reference line numbers only when they help — not mechanically
- If the language has idioms a developer from another language might not know, explain them briefly inline
- If the function is a one-liner or trivially named (e.g. `getId()`), respond with a single sentence and stop
- Adapt tone to complexity: plain and direct for LOW, clear and structured for MEDIUM/HIGH
