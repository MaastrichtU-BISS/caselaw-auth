# The server contract

Not published. This is the single definition of what the server-side auth
implementations do, and the executable cases that hold them to it.

```
contract.json              the wire format, in prose and structure
conformance/cases.json     executable cases, loaded by BOTH languages
conformance/interop.mjs    seals in each language, unseals in the other
```

## Why it exists

`caselaw-auth/server` (TypeScript) and `caselaw-auth-server` (Python) are
**interchangeable**, not merely similar: a session cookie sealed by either
unseals in the other, byte for byte. That property is easy to state and easy to
lose — a default argument changed in one language, and the two silently stop
agreeing.

So the cases live here, once, and both test suites load this file by relative
path.

> **Never copy a case into a language's own tests.** One copy is the entire
> guarantee. A case inlined into one suite stops constraining the other the
> moment somebody edits it, and nothing fails to tell you.

This pattern has a track record in this estate. In `caselaw-access`,
`project_not_connected` went into its conformance cases and the JavaScript
client failed its own tests immediately and was fixed in the same pass;
`/v1/manifest` skipped them, shipped in Python only, and drifted unnoticed.

## Running the suites

```bash
# TypeScript — against dist/, so it checks what ships
cd packages/caselaw-auth && npm run build && node --test test/

# Python
cd packages/python && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest

# Cross-language: the property the per-language suites cannot prove
node packages/contract/conformance/interop.mjs
```

The per-language suites prove each implementation matches the contract. They
cannot prove the two agree with *each other* — both could satisfy every case
while reading the same expectation through the same misunderstanding. That is
what `interop.mjs` is for, and why it asserts identical bytes rather than only a
successful round trip.

## Changing the contract

1. Change `contract.json` and add a case to `conformance/cases.json`.
2. Watch both suites fail.
3. Fix both implementations in the same pass.

Step 2 is the point. A change that breaks neither suite is a change no test
covers, and should be treated as a gap in the cases rather than as a safe
change.

Where a behaviour genuinely cannot be expressed as a case, implement it in both
languages anyway and say so explicitly in `contract.json`, rather than leaving
it in one.

## What is pinned, and why these

The full detail is in `contract.json`. The ones that bite:

- **JSON serialisation.** Python's `json.dumps` inserts spaces and escapes
  non-ASCII to `\uXXXX`; `JSON.stringify` does neither. Unpinned, the same Dutch
  or Norwegian name seals to different bytes in each language.
- **Session keys stay camelCase in both.** They are wire format, not API
  surface. Renaming them per language would break the one property this exists
  to guarantee.
- **Unsealing returns nothing rather than raising**, for every kind of bad
  input. Distinguishing a tampered cookie from an absent one tells an attacker
  which half they got right.
- **`aud` is unchecked by default.** Keycloak puts `account` there for a public
  client's access token and names the client in `azp`, so checking it rejects
  every valid token.
