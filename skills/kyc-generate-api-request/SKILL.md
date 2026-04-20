---
name: kyc-generate-api-request
description: Generate backend API request examples in cURL from selected code. Use when the user asks to generate cURL from backend routes/controllers/services.
---

# KYC Generate API Request

## Scope

- Accept only backend code contexts: route handlers, controllers, backend services, or server-side HTTP client code.
- If the provided code is frontend-only or not API-related, respond with exactly `BACKEND_API_NOT_DETECTED`.

## Extraction Checklist

- Identify HTTP method.
- Identify endpoint path and base URL; merge literals into one absolute URL on the curl line when possible.
- Detect headers, including Authorization/API key patterns.
- Detect query parameters and path parameters.
- Detect request body and format (JSON, multipart, form-urlencoded).
- When the user prompt includes "Detected API metadata" with `Inferred request URL`, use that string as the `curl` URL unless the code contradicts it.
- Detect env/config references and preserve as placeholders only when unresolved (`{{TOKEN}}`). If host/base URL is missing but a path is known, use `http://localhost:3000` as default host.

## Output Rules

- One `## cURL` section with exactly one fenced code block (verbose, multi-line, backslash continuations).
- First line: `curl 'https://...full-path...' \` using a real absolute URL when inferable; if only path is known, use `http://localhost:3000/<path>`.
- One `-H 'name: value' \` per header implied by the code; JSON requests may include `Accept` and `Content-Type` when consistent with the snippet.
- JSON POST/PUT/PATCH: `--data-raw '{"key":...}'` on one line.
- Do not fabricate browser fingerprint headers (sec-ch-ua, sec-fetch-*, user-agent, etc.) unless they appear in the selection.
- Never invent endpoints, auth schemes, or payload fields not inferable from the code.
- Add a final `## Notes` section for assumptions/placeholders.

## Language Target

- cURL only
