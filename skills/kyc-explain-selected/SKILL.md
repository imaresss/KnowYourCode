---
name: kyc-explain-selected
description: >-
  Handle /kyc-explain-selected prompts from the Know Your Code extension.
  Use when a message starts with /kyc-explain-selected. Explains selected
  code in two sections: what the code does (logic and purpose), then language
  concepts used (non-trivial stdlib/library calls only, deduplicated against
  chat history).
---

# KYC — Explain Selected Code

When a message starts with `/kyc-explain-selected`, follow this two-section structure.
Assume the user may be new to the language — explain language-specific concepts clearly, but skip anything trivially obvious.

---

## Section 1 — What this code does

**Single line selected:**
Write 2–3 sentences. What this line accomplishes, and why it exists in this context. Reference the enclosing function if it helps orient the reader.

**Multiple lines selected:**
Write a brief intro sentence, then walk through the code in logical chunks — not line-by-line if multiple lines do the same thing. Focus on WHAT the code does and WHY it exists. The mechanics of language-specific calls belong in Section 2, not here.

Keep Section 1 plain and readable — no jargon, no type signatures, no parameter lists.

---

## Section 2 — Language concepts used here

One entry per non-trivial stdlib or language-specific call found in the selection.

**Format per entry:**
> **`functionName()`**
> What it does in general. What it does specifically in this context. When you'd use it.
> (2–4 sentences max)

### Always explain (non-trivial)

- Higher-order functions: `map`, `filter`, `reduce`, `flatMap`, `forEach`, `collect`, `find`, `some`, `every`
- Optional/Maybe handling: `Optional.of()`, `orElse()`, `orElseThrow()`, `ifPresent()`, `ifPresentOrElse()`
- Stream/pipeline collectors: `groupingBy()`, `partitioningBy()`, `toMap()`, `joining()`
- Sorting with comparators: `Comparator.comparing()`, `thenComparing()`, `sorted()`, `reversed()`
- Async/concurrent constructs: `CompletableFuture`, `Promise`, `async/await`, `synchronized`, `volatile`
- Regex usage: any call involving a pattern or regex literal
- Date/time operations: parsing, formatting, arithmetic on dates
- JSON parsing or serialization calls
- Type-specific conversions with non-obvious behaviour: `parseInt` with radix, `split` with regex, `slice` with negative indices
- Try-with-resources, `finally` semantics
- List comprehensions and generator expressions (Python)
- Destructuring assignments (JS/TS, Python)
- Null-coalescing and optional chaining operators: `??`, `?.`, `?:`
- Language-specific collection constructors with non-obvious behaviour: `Arrays.asList()`, `List.of()`, `Set.copyOf()`

### Always skip (trivial)

- Simple getters/property access: `obj.getId()`, `obj.name`, `entity.getValue()`
- Basic arithmetic and comparisons: `a + b`, `x > 0`, `count++`, `total * 0.1`
- Simple null checks: `if (x == null)`, `x != null`
- Plain assignments and returns
- Logging and print statements: `log.info()`, `console.log()`, `System.out.println()`
- Basic object construction with obvious meaning: `new ArrayList<>()`, `new HashMap<>()`
- Simple string concatenation or interpolation
- Basic boolean operators: `&&`, `||`, `!`

### Deduplication rules (silent — never mention to the user)

1. **Chat history:** Before explaining any concept, scan previous messages in this conversation. If the concept was already explained, skip it entirely — do not say "as I mentioned before."
2. **Within this response:** If the same function appears more than once in the selection, explain it once only.
3. **Exception:** If the same function is used in a meaningfully different way in this selection compared to how it appeared in chat history, add a single sentence noting the difference.

### When to omit Section 2

If the selection contains zero non-trivial concepts, omit Section 2 entirely — do not write a heading with nothing under it.

---

## Hard rules — always apply

- Infer the programming language from context — adapt all concept names and examples to that language
- No parameter type lists or method signatures anywhere
- No bullet lists of trivial operations
- Section 1 must stand alone — a reader who skips Section 2 should still understand what the code does
- Keep entries in Section 2 focused on this specific usage context, not a generic documentation dump
