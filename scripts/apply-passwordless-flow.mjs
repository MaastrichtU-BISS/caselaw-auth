#!/usr/bin/env node

// Keep the repository command as a compatibility wrapper around the same
// installer that ships in the caselaw-auth npm package.
await import('../packages/caselaw-auth/admin/apply-passwordless-flow.mjs')
