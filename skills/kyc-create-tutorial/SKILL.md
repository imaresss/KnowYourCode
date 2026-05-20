---
name: kyc-create-tutorial
description: Handle /kyc-create-tutorial prompts. In Cursor chat, produce a readable step-by-step tutorial in Markdown. Reserve JSON only when explicitly requested or for tooling.
---

## Critical UX rule

**Cursor chat is read by humans.** Your primary reply MUST be a normal Markdown tutorial (headings, short paragraphs, optional bullets). **Do not** paste large blobs of raw JSON as your main answer—nobody should have to read that.

The Know Your Code VS Code/Cursor extension can generate **interactive** tutorials (scene navigation + highlights + browser speech) via the **`KYC: Create Tutorial`** command in the editor. Chat handoff is the **readable** companion, not a JSON pipe.

---

## When `/kyc-create-tutorial` is invoked

1. Read whether the prompt asks **function** or **callflow** mode (default: **function**).
2. Open/read the referenced file lines and symbol. For callflow, use callers/callees context.

### Default response format (use this unless user asks otherwise)

Structure:

1. **Title** — plain `#` heading  
2. **At a glance** — 2–4 sentences (who calls / what it returns / why it exists).  
3. **Tutorial walkthrough** — **≥ 3 sections** with `## Scene N — Short title` (or similar). Under each: conversational prose (what happens on those lines, why it matters). Reference **real line numbers** from the file when pointing at code.  
4. **Flow / sequence** — optional short Markdown description or ASCII arrows (`Client → Service → DAO`). Omit if useless.  
5. **Key takeaways** — 3–6 bullets.

Tone: written for developers skimming in chat; clear and concrete.

### Optional extras

- **Small code excerpts** only when helpful—prefer referencing symbols + line ranges instead of dumping the whole method.  
- Call out typos or smells briefly if relevant (e.g. DAO method name typo)—still readable prose.

### JSON format — ONLY when explicitly requested

Output tutorial JSON **only if** the user asks for JSON / extension-player payload / machine-readable / skill-schema—for example: “give me the tutorial JSON”.

Then use exactly:

````markdown
<details>
<summary>Extension-player JSON (optional)</summary>

```json
{ ... valid TutorialScript shape ... }
```

</details>
````

The tutorial JSON shape (when requested): top-level `title`, `audience`, `summary`, `scenes[]` (each with `id`, `title`, `narration`, `highlightLines`, optional `highlightIdentifiers`, optional `takeaway`), optional `diagram` (`type`: sequence | flow, `steps`: `{ from, to, label? }[]`), `keyTakeaways[]`. Minimum 3 scenes. Lines must match the real file.

---

## Closing reminder for chat replies

End with one short line when helpful:

> For narrated scenes + editor highlights in the IDE: **Command Palette → `KYC: Create Tutorial`**.
