import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isExcepted } from './security-audit.mjs'

const date = Date.parse('2026-11-18T00:00:00Z')
function fixture() {
  return {
    vulnerabilities: {
      picomatch: { nodes: ['node_modules/picomatch'], via: [{
        name: 'picomatch', url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
      }] },
      vite: { nodes: ['node_modules/vite'], via: ['picomatch'] },
    },
    packages: { 'node_modules/picomatch': { dev: true }, 'node_modules/vite': { dev: true } },
  }
}
test('accepts only the known advisory through development-only chains', () => {
  const { vulnerabilities, packages } = fixture()
  assert.equal(isExcepted('vite', vulnerabilities, packages, date), true)
})
test('rejects a production dependency in the affected chain', () => {
  const { vulnerabilities, packages } = fixture()
  packages['node_modules/picomatch'].dev = false
  assert.equal(isExcepted('vite', vulnerabilities, packages, date), false)
})
test('rejects additional advisories on the same package', () => {
  const { vulnerabilities, packages } = fixture()
  vulnerabilities.picomatch.via.push({ name: 'picomatch', url: 'https://example.com/new-advisory' })
  assert.equal(isExcepted('vite', vulnerabilities, packages, date), false)
})
test('rejects expired exceptions and missing dependency metadata', () => {
  const { vulnerabilities, packages } = fixture()
  assert.equal(isExcepted('vite', vulnerabilities, packages, Date.parse('2026-12-19')), false)
  delete packages['node_modules/picomatch']
  assert.equal(isExcepted('vite', vulnerabilities, packages, date), false)
})
test('rejects circular dependency chains', () => {
  const { vulnerabilities, packages } = fixture()
  vulnerabilities.picomatch.via = ['vite']
  assert.equal(isExcepted('vite', vulnerabilities, packages, date), false)
})
