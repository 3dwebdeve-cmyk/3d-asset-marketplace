import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// GHSA-fc5q-39xc-vjpf has no patched npm release as of 2026-11-18.
// Only allow its development-tool dependency chains, never production packages.
// Recheck monthly; an expired exception fails CI until reviewed or removed.
const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
const expires = Date.parse('2026-12-19T00:00:00Z')
export function isExcepted(name, vulnerabilities, packages, now = Date.now(), seen = new Set()) {
  if (now >= expires || seen.has(name)) return false
  const entry = vulnerabilities[name]
  if (!entry?.nodes?.length || !entry.via?.length) return false
  if (!entry.nodes.every(node => packages[node]?.dev === true)) return false
  const visited = new Set([...seen, name])
  return entry.via.every(via => typeof via === 'string'
    ? isExcepted(via, vulnerabilities, packages, now, visited)
    : via.name === 'picomatch' && via.url === advisory)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const result = spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'npm',
    process.platform === 'win32' ? ['/d', '/s', '/c', 'npm audit --json'] : ['audit', '--json'], {
    encoding: 'utf8',
  })
  if (result.error || ![0, 1].includes(result.status)) {
    console.error(result.error ?? result.stderr ?? 'npm audit failed')
    process.exit(1)
  }
  let report
  try { report = JSON.parse(result.stdout) } catch {
    console.error('npm audit did not return valid JSON')
    process.exit(1)
  }
  if (report.error || !report.vulnerabilities) {
    console.error('npm audit could not retrieve a vulnerability report', report.error)
    process.exit(1)
  }
  const vulnerabilities = report.vulnerabilities
  const failures = []
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (isExcepted(name, vulnerabilities, lock.packages)) {
      console.warn(`Temporary dev-only exception: ${name} (${advisory}; expires 2026-12-19)`)
    } else if (['moderate', 'high', 'critical'].includes(entry.severity)) {
      failures.push(name)
      console.error(`${entry.severity}: ${name}`, entry.via)
    }
  }
  if (failures.length) process.exit(1)
  console.log('Security audit passed: no unexcepted moderate, high or critical findings.')
}
