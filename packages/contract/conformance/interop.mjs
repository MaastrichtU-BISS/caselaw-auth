/**
 * Cross-language interchangeability check.
 *
 * The per-language suites prove each implementation matches the contract. They
 * do not prove the two can hand a session to each other — an implementation
 * could satisfy every case in isolation and still write a cookie the other
 * cannot read, because both suites would be reading the same expectations
 * through the same misunderstanding.
 *
 * This seals in each language and unseals in the other, which is the property
 * the contract exists to guarantee and the only test that can fail when it
 * breaks.
 *
 *   node packages/contract/conformance/interop.mjs [path-to-python]
 *
 * Defaults to packages/python/.venv/bin/python.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..', '..')
const CASES = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'))

const python = process.argv[2] || join(root, 'packages', 'python', '.venv', 'bin', 'python')
if (!existsSync(python)) {
  console.error(`No Python at ${python}.\nCreate it with:\n  cd packages/python && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"`)
  process.exit(2)
}

const { createServerAuth } = await import(join(root, 'packages', 'caselaw-auth', 'dist', 'server.js'))

const CONFIG = {
  issuer: 'https://auth.example.org/realms/caselaw',
  clientId: 'conformance-client',
  redirectUri: 'https://example.org/auth/callback',
  sessionSecret: CASES.secret,
}
const auth = createServerAuth(CONFIG)

/** Long-lived, so the check does not depend on how fast it runs. */
const future = Math.floor(Date.now() / 1000) + 3600
const SESSIONS = [
  { user: { id: 'u-1', email: null, name: null }, roles: [], expiresAt: future },
  {
    user: { id: 'u-2', email: 'a@example.org', name: 'A Person' },
    roles: ['admin', 'researcher'],
    expiresAt: future,
    idToken: 'id-token-value',
  },
  // Non-ASCII, because this is where the two languages' JSON defaults disagree:
  // Python escapes to \uXXXX unless told otherwise, JavaScript never does.
  { user: { id: 'u-3', email: null, name: 'Ruben Sørensen' }, roles: ['redacteur'], expiresAt: future },
]

const runPython = (source) =>
  JSON.parse(execFileSync(python, ['-c', source], { encoding: 'utf8', cwd: root }))

/** Embeds data as a JSON string for json.loads, never as a literal: JSON's
 *  null/true/false are not Python's, and interpolating them is a NameError. */
const pyValue = (value) => `json.loads(${JSON.stringify(JSON.stringify(value))})`

const PY_PREAMBLE = `
import json, sys
sys.path.insert(0, "packages/python/src")
from caselaw_auth_server import create_server_auth
auth = create_server_auth(
    issuer=${JSON.stringify(CONFIG.issuer)},
    client_id=${JSON.stringify(CONFIG.clientId)},
    redirect_uri=${JSON.stringify(CONFIG.redirectUri)},
    session_secret=${JSON.stringify(CONFIG.sessionSecret)},
)
`

let failures = 0
const check = (name, fn) => {
  try {
    fn()
    console.log(`  ok    ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL  ${name}\n        ${error.message.split('\n')[0]}`)
  }
}

// ── TypeScript seals, Python unseals ────────────────────────────────────────

const sealedByTs = []
for (const session of SESSIONS) sealedByTs.push(await auth.sealSession(session))

const unsealedByPy = runPython(
  `${PY_PREAMBLE}\nprint(json.dumps([auth.unseal_session(v) for v in ${pyValue(sealedByTs)}]))`,
)

SESSIONS.forEach((session, index) => {
  check(`TypeScript seals → Python unseals [${session.user.id}]`, () => {
    assert.deepEqual(unsealedByPy[index], session)
  })
})

// ── Python seals, TypeScript unseals ────────────────────────────────────────

const sealedByPy = runPython(
  `${PY_PREAMBLE}\nprint(json.dumps([auth.seal_session(s) for s in ${pyValue(SESSIONS)}]))`,
)

for (const [index, session] of SESSIONS.entries()) {
  const unsealed = await auth.unsealSession(sealedByPy[index])
  check(`Python seals → TypeScript unseals [${session.user.id}]`, () => {
    assert.deepEqual(unsealed, session)
  })
}

// ── and the bytes themselves agree ──────────────────────────────────────────

SESSIONS.forEach((session, index) => {
  check(`identical bytes [${session.user.id}]`, () => {
    assert.equal(sealedByPy[index], sealedByTs[index])
  })
})

// ── a forgery is rejected by both ───────────────────────────────────────────

// A real payload with a signature that is not its own. Both must refuse it, and
// both must refuse the *same* one — an implementation that accepted this would
// let anyone rewrite their own roles.
const [payload] = sealedByTs[1].split('.')
const forged = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

const pyRejects = runPython(`${PY_PREAMBLE}\nprint(json.dumps(auth.unseal_session(${pyValue(forged)})))`)
// Awaited before check(), because check() is synchronous: an async callback
// would resolve after it returned and a failure inside would surface as an
// unhandled rejection rather than a recorded failure.
const tsRejects = await auth.unsealSession(forged)

check('Python rejects a forged signature', () => {
  assert.equal(pyRejects, null)
})
check('TypeScript rejects the same forgery', () => {
  assert.equal(tsRejects, null)
})

console.log(failures ? `\n${failures} FAILED` : '\nboth implementations are interchangeable')
process.exit(failures ? 1 : 0)
