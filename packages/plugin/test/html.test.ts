import { expect, test } from 'vitest'
import { rewriteHtml } from '../src/html'

// Vite 8 output, plus modulepreload links and a user script that must survive.
const viteHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Greeting</title>
    <script type="module" src="https://example.com/analytics.js"></script>
    <script type="module" crossorigin src="/album/assets/index-DYlAoKer.js"></script>
    <link rel="modulepreload" crossorigin href="/album/assets/vendor-a1.js">
    <link rel="modulepreload" crossorigin href="/album/assets/vendor-b2.js">
    <link rel="stylesheet" crossorigin href="/album/assets/index-C1_AJIBh.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

const options = { base: '/album/', bootFile: 'assets/boot-x1.js', entryFile: 'assets/index-DYlAoKer.js' }

test('swaps the entry script for the bootstrap and keeps the rest', () => {
  const out = rewriteHtml(viteHtml, options)
  expect(out).not.toContain('index-DYlAoKer.js')
  expect(out).not.toContain('modulepreload')
  expect(out).toContain('analytics.js')
  expect(out).toContain('index-C1_AJIBh.css')
  expect(out.match(/<script type="module" src="\/album\/assets\/boot-x1\.js"><\/script>/g)).toHaveLength(1)
  expect(out.indexOf('boot-x1.js')).toBeLessThan(out.indexOf('</head>'))
})

test('removeCss unlinks the inlined stylesheet', () => {
  const out = rewriteHtml(viteHtml, { ...options, removeCss: ['assets/index-C1_AJIBh.css'] })
  expect(out).not.toContain('rel="stylesheet"')
})
