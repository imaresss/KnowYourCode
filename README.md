# Know Your Code

`Know Your Code` is a VS Code extension that explains the current function, traces connected calls, and caches explanations so developers do not pay the model cost more than necessary.

## V1 goals

- Explain the current function
- Derive a line explanation from the enclosing function
- Cache explanations in SQLite
- Invalidate cache when the function or direct dependency graph changes
- Support a single provider mode per deployment: `local` or `cloud`

## Planned architecture

- VS Code extension layer for commands and UI
- Code intelligence layer for symbol resolution and context building
- Explanation orchestrator for cache lookup, invalidation, and provider calls
- Model provider abstraction with one active mode
- SQLite persistence for symbols, explanations, and call edges

## Commands

- `Know Your Code: Explain Current Function`
- `Know Your Code: Explain Current Line`
- `Know Your Code: Refresh Explanation`

## Next build steps

1. Add real language-server-backed call hierarchy resolution
2. Add provider adapters for Ollama and the chosen cloud API
3. Add migration support and richer invalidation
4. Add tests for symbol extraction and cache logic
