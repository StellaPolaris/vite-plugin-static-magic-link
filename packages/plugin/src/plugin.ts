import { posix } from 'node:path'
import { loadEnv } from 'vite'
import type { Plugin, ResolvedConfig } from 'vite'
import { buildBootstrap } from './bootstrap'
import { encrypt, generateKey, parseKey } from './crypto'
import { rewriteHtml } from './html'

export interface StaticMagicLinkOptions {
  /**
   * 32-byte key as base64url (43 chars). Defaults to MAGIC_LINK_KEY from the
   * environment or .env files. Without a key the build fails and prints a fresh one.
   */
  key?: string
  /** false skips encryption entirely (plain Vite build, no key needed). Default true. */
  enabled?: boolean
  /** Inline the CSS into the encrypted bundle. Default false. */
  css?: boolean
}

const NAME = 'vite-plugin-static-magic-link'
const ENV_KEY = 'MAGIC_LINK_KEY'

export function staticMagicLink(options: StaticMagicLinkOptions = {}): Plugin {
  if (options.enabled === false) return { name: NAME, apply: 'build' }

  const warnings: string[] = []
  let config: ResolvedConfig
  let key: string
  let encrypted = false

  return {
    name: NAME,
    apply: 'build',
    enforce: 'post',

    // SPEC.md 6.1: force one JS chunk and no source maps.
    config(user) {
      for (const opts of [user.build?.rollupOptions, user.build?.rolldownOptions]) {
        const output = opts?.output
        if (Array.isArray(output)) throw new Error('static-magic-link: multiple outputs are not supported')
        if (output?.manualChunks) {
          delete output.manualChunks
          warnings.push('static-magic-link: manualChunks is ignored, the bundle must be a single chunk')
        }
      }
      if (user.build?.sourcemap) warnings.push('static-magic-link: sourcemap is forced off, maps would contain the plaintext')
      return {
        build: {
          sourcemap: false,
          cssCodeSplit: false,
          modulePreload: false,
          rolldownOptions: { output: { codeSplitting: false } },
        },
      }
    },

    // SPEC.md 6.2: remember base, load and check the key.
    configResolved(resolved) {
      config = resolved
      for (const warning of warnings) config.logger.warn(warning)
      if (config.build.ssr || config.build.lib) throw new Error('static-magic-link: SSR and library builds are not supported')
      if (!config.base.startsWith('/')) throw new Error('static-magic-link: base must be an absolute path like "/" or "/album/"')

      const exposing = [config.envPrefix ?? []].flat().filter((prefix) => ENV_KEY.startsWith(prefix))
      if (exposing.length) throw new Error(`static-magic-link: envPrefix ${JSON.stringify(exposing)} would expose ${ENV_KEY} to client code`)

      const text = (options.key ?? loadEnv(config.mode, config.envDir, 'MAGIC_LINK_')[ENV_KEY])?.trim()
      const help = `Set ${ENV_KEY}, for example in .env.production.local:\n  ${ENV_KEY}=${generateKey()}`
      if (!text) throw new Error(`static-magic-link: no key. ${help}`)
      if (!parseKey(text)) throw new Error(`static-magic-link: the key must be 43 base64url characters. ${help}`)
      key = text
    },

    // SPEC.md 6.3: encrypt the chunk, emit the bootstrap, rewrite index.html.
    // order: 'post' runs after Vite's own build plugins, which still rewrite the chunk
    // (e.g. __VITE_PRELOAD__) in their generateBundle.
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const files = Object.values(bundle)
        const pages = files.filter((file) => file.type === 'asset' && file.fileName.endsWith('.html'))
        if (pages.length !== 1 || pages[0].type !== 'asset') {
          this.error(`static-magic-link: expected one index.html, got ${pages.length}. Multi-page apps are not supported yet.`)
        }
        const chunks = files.filter((file) => file.type === 'chunk')
        if (chunks.length !== 1 || chunks[0].type !== 'chunk') {
          this.error(`static-magic-link: expected one chunk, got ${chunks.length} (${chunks.map((c) => c.fileName).join(', ')}). Check that nothing overrides the single-chunk output option.`)
        }
        const [page, chunk] = [pages[0], chunks[0]]

        let code = chunk.code
        const removeCss: string[] = []
        if (options.css) {
          let css = ''
          for (const file of files) {
            if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue
            css += String(file.source)
            removeCss.push(file.fileName)
            delete bundle[file.fileName]
          }
          code = `(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();\n${code}`
        }

        const encFile = this.getFileName(this.emitFile({ type: 'asset', name: 'app.enc', source: encrypt(Buffer.from(code), key) }))
        delete bundle[chunk.fileName]

        // The bootstrap fetches the ciphertext relative to itself, so both must share a folder.
        const bootSource = buildBootstrap({ encFile: posix.basename(encFile), base: config.base })
        const bootFile = this.getFileName(this.emitFile({ type: 'asset', name: 'boot.js', source: bootSource }))
        if (posix.dirname(bootFile) !== posix.dirname(encFile)) {
          this.error(`static-magic-link: ${bootFile} and ${encFile} must be in the same folder. Check build.rolldownOptions.output.assetFileNames.`)
        }
        page.source = rewriteHtml(String(page.source), { base: config.base, bootFile, entryFile: chunk.fileName, removeCss })
        encrypted = true
      },
    },

    // SPEC.md 6.4: print the share link (the key stays out of CI logs).
    closeBundle() {
      if (!encrypted) return
      const shown = process.env.CI ? `$${ENV_KEY}` : key
      config.logger.info(
        `\nstatic-magic-link\n` +
          `  share: ${config.base}#key=${shown}\n` +
          `  test:  vite preview, then open http://localhost:4173${config.base}#key=${shown}`,
      )
    },
  }
}
