import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import { expect, test } from 'vitest'
import { generateKey } from '../src/crypto'
import { staticMagicLink } from '../src/index'

const root = fileURLToPath(new URL('../../../examples/greeting-site', import.meta.url))

test('builds the example into a bootstrap plus one encrypted bundle', async () => {
  const key = generateKey()
  const outDir = mkdtempSync(join(tmpdir(), 'sml-build-'))
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [react(), staticMagicLink({ key })],
    build: { outDir, emptyOutDir: true },
  })

  const assets = readdirSync(join(outDir, 'assets'))
  const boot = assets.filter((f) => f.endsWith('.js'))
  const enc = assets.filter((f) => f.endsWith('.enc'))
  expect(boot).toEqual([expect.stringMatching(/^boot-[\w-]+\.js$/)])
  expect(enc).toEqual([expect.stringMatching(/^app-[\w-]+\.enc$/)])
  expect(readFileSync(join(outDir, 'index.html'), 'utf8')).toContain(`<script type="module" src="/assets/${boot[0]}"></script>`)
  expect(readFileSync(join(outDir, 'assets', boot[0]), 'utf8')).toContain(JSON.stringify(enc[0]))

  const file = new Uint8Array(readFileSync(join(outDir, 'assets', enc[0])))
  const cryptoKey = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64url'), { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.subarray(4, 16) }, cryptoKey, file.subarray(16))
  const code = new TextDecoder().decode(plain)
  expect(code).toContain('SML_FIXTURE_MARKER')
  expect(code).not.toContain('__VITE_PRELOAD__') // Vite's own generateBundle must run first
}, 60_000)
