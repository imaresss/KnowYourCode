---
name: kyc-explain-selected
description: Handle /kyc-explain-selected prompts. Explains selected code in two sections: what it does, then language concepts used (non-trivial only, deduplicated).
---

# KYC — Explain Selected Code

When a message starts with `/kyc-explain-selected`, produce a two-section explanation. Assume the reader may be new to the language.

## Section 1 — What this code does

**Single line:** 2–3 sentences — what it accomplishes and why it exists in context.

**Complex one-liner (chained operations):** explain it as a pipeline — one stage at a time — even though it is a single line.

**Multiple lines:** brief intro sentence, then walk through in logical chunks (not line-by-line if multiple lines do the same thing). Focus on WHAT and WHY. Language-specific mechanics belong in Section 2.

If the selection contains a try/catch or error handling construct: always explain what is being caught and what the recovery strategy is — this is often the most important thing to understand.

If the selection is async (await, Promise, CompletableFuture, coroutine): explain what is being awaited and what happens on failure.

If an obvious structural pattern is present (builder, decorator, factory, strategy): name it.

No jargon, no type signatures, no parameter lists.

## Section 2 — Language concepts used here

One entry per non-trivial concept. Limit to 5 entries maximum — prioritise the least obvious ones.

**Per entry:** `functionName()` — what it does in general, what it does in this context, when you'd use it. (2–4 sentences)

### Always explain
- Higher-order functions: `map`, `filter`, `reduce`, `flatMap`, `forEach`, `find`, `some`, `every`, etc.
- Optional/Maybe: `orElse()`, `orElseThrow()`, `ifPresent()`, `ifPresentOrElse()`
- Stream collectors: `groupingBy()`, `partitioningBy()`, `toMap()`, `joining()`
- Sorting: `Comparator.comparing()`, `thenComparing()`, `sorted()`, `reversed()`
- Async/concurrent: `CompletableFuture`, `Promise`, `async/await`, `synchronized`, `volatile`
- Regex, date/time operations, JSON parsing/serialization
- Non-obvious conversions: `parseInt` with radix, `split` with regex, `slice` with negative indices
- Try-with-resources, `finally` semantics
- List comprehensions, generator expressions (Python)
- Destructuring assignments (JS/TS, Python)
- Null-coalescing/optional chaining: `??`, `?.`, `?:`
- Collection constructors with non-obvious behaviour: `Arrays.asList()`, `List.of()`, `Set.copyOf()`

### Always skip
- Getters, property access, basic arithmetic, comparisons
- Simple null checks, plain assignments, plain returns
- Logging and print statements
- Basic object construction with obvious meaning
- Simple string concatenation or interpolation
- Basic boolean operators

### Deduplication (silent — never mention to user)
- If a concept was explained earlier in this conversation: skip it entirely — no "as I mentioned" note
- If the same function appears more than once in the selection: explain it once only
- Exception: if the same function is used in a meaningfully different way vs. chat history, add one sentence noting the difference

### When to omit Section 2
If the selection has zero non-trivial concepts, omit Section 2 entirely — do not write an empty heading.

## Hard rules — always apply

- Infer the programming language from context — adapt all concept names and examples accordingly
- No parameter type lists or method signatures
- Section 1 must stand alone — a reader who skips Section 2 should still understand what the code does
- Keep Section 2 entries focused on this specific usage context, not a generic documentation dump
