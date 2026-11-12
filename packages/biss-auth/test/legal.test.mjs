import assert from 'node:assert/strict'
import { test } from 'node:test'

import { legalLinks } from '../dist/index.js'

test('a product gets back only the documents it configured, in order', () => {
  assert.deepEqual(
    legalLinks({
      termsUrl: 'https://example.org/terms',
      cookiesUrl: '/cookies',
      extra: [{ label: 'Imprint', href: 'https://example.org/imprint' }],
    }),
    [
      { label: 'Terms of Service', href: 'https://example.org/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
      { label: 'Imprint', href: 'https://example.org/imprint' },
    ],
  )
})

test('labels can be translated per product', () => {
  assert.deepEqual(legalLinks({ privacyUrl: 'https://example.org/p', labels: { privacy: 'Privacybeleid' } }), [
    { label: 'Privacybeleid', href: 'https://example.org/p' },
  ])
})

test('no configuration shows nothing, and script or protocol-relative addresses are dropped', () => {
  assert.deepEqual(legalLinks(undefined), [])
  assert.deepEqual(
    legalLinks({
      termsUrl: 'javascript:alert(1)',
      privacyUrl: '//evil.example/p',
      extra: [{ label: 'Data', href: 'data:text/html,x' }],
    }),
    [],
  )
})
