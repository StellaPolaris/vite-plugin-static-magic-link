# vite-plugin-static-magic-link — build spec

Status: decided 2026-10-12. This file is the source of truth for building v1.3.1 (first release; version chosen 2026-10-19).
A mirror with the flow diagram lives in Claude Docs:
https://claude.ai/code/artifact/11ee8437-8020-483b-a629-fb3c5a6df5ab

## 1. What it is

A Vite plugin that turns a static site into a **static magic link**. At `vite build`
the plugin forces a single JavaScript bundle, encrypts it with AES-GCM, and replaces
Vite's script tag in `index.html` with a small plaintext bootstrap. At runtime the
bootstrap reads the key from the URL fragment (`#key=…`), fetches the ciphertext,
decrypts it with WebCrypto, and imports it from a Blob URL. The app runs unchanged.

The host, CDN, crawlers, and anyone without the link see only ciphertext. Anyone with
the link runs the site. This is isolation and obfuscation for low-stakes personal
sites (photo album, shared calendar, greeting card), **not** a security product.

Non-goals: secrecy from link holders, DRM, server verification, revocation, expiry,
code splitting.

## 2. Why this design (decisions log)

| Decision | Chosen | Why |
| --- | --- | --- |
| Decryption mechanism | In-page WebCrypto + `import(blobUrl)` | No service worker. Works in Firefox private mode (no SW there, Mozilla bug 1320796 open), survives hard refresh, no worker lifecycle or key persistence |
| Bundle shape | One JS file (`output.codeSplitting: false`) | Blob URLs break static imports *between* chunks. One chunk has none, so the Blob loader works |
| Vite range | `>=8` only (decided 2026-10-19) | One code path (`codeSplitting`), one test target |
| Cipher | AES-GCM, 256-bit key, 12-byte IV, 16-byte tag | Authenticated: a wrong key rejects cleanly instead of feeding garbage to the module loader. Native in `node:crypto` and `crypto.subtle` |
| Key delivery | URL fragment `#key=<base64url>` | Fragments are never sent to the server. Sharing = sending a link. No UI |
| Key format | 32 random bytes, base64url (43 chars, no padding) | URL-safe, pasteable, no password derivation needed |
| Key source | `key` option, else `MAGIC_LINK_KEY` via Vite `loadEnv` (`.env.production.local` locally, CI secret in CI). No key → build fails and suggests a fresh one (decided 2026-10-19) | A random key per build breaks every shared link on redeploy. Same approach as vite-plugin-keyhole |
| Fragment after load | Kept in the URL (decided 2026-10-19) | Bookmarks and history keep working. iOS Safari wipes all script-writable storage after 7 days of Safari use without a visit, so a stripped URL would go dead there |
| Key memory | Also saved to `localStorage` under `static-magic-link:<base pathname>` (decided 2026-10-19) | Client-side navigation drops the fragment; reload on `/gallery` must still open. IndexedDB with a non-extractable CryptoKey was considered: it only hides the key bytes from same-origin scripts, which can still decrypt; not worth ~25 lines for low-stakes sites. IndexedDB is wiped on the same iOS 7-day rule |
| Base | Absolute only (`/`, `/album/`); relative `./` throws (decided 2026-10-19) | With a relative base Vite builds asset URLs from `import.meta.url`, which is `blob:` here |
| Bootstrap placement | External `assets/boot-[hash].js` | Keeps a strict CSP possible later; whole dist is cacheable |
| Ciphertext name | `assets/app-[hash].enc`, filename baked into the bootstrap (decided 2026-10-19) | The key-less bootstrap is otherwise identical across builds, so a fixed `app.enc` would be served stale from CDN caches |
| CSS | Plaintext by default; `css: true` inlines into the bundle | Most personal sites don't care about CSS leaking; the option is one flag |
| Binary assets | Not encrypted in v1 | Needs runtime URL rewriting. Vite's `assetsInlineLimit` already pulls small images into the bundle for free |
| Source maps | Forced off | They contain the plaintext |
| Dev server | Untouched (`apply: 'build'`) | Local development stays normal |
| Hook strategy | `enforce: 'post'` plugin, `generateBundle` with `order: 'post'` | Runs after all of Vite's build plugins: `index.html` is in the bundle, and Vite's import analysis has already replaced `__VITE_PRELOAD__` in the chunk (found 2026-10-19: without `order: 'post'` the decrypted app throws `__VITE_PRELOAD__ is not defined`) |
| Consumer docs | README only (plus LICENSE), copied into the package by `prepack`. No AGENTS.md or CLAUDE.md shipped (decided 2026-10-19) | Agents already read `node_modules/<pkg>/README.md` and the `.d.ts` JSDoc. A CLAUDE.md in `packages/plugin/` would also be loaded while developing this repo and mix consumer and developer instructions |
| Package name | `vite-plugin-static-magic-link`, export `staticMagicLink` | Known term + one scoping word. Free on npm as of 2026-10-12 |

## 3. Public API

```ts
import { staticMagicLink } from 'vite-plugin-static-magic-link'

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

export function staticMagicLink(options?: StaticMagicLinkOptions): Plugin
```

Also exported for tests and advanced use:

```ts
export function generateKey(): string                         // base64url
export function encrypt(plain: Uint8Array, key: string): Uint8Array   // Node
export const FILE_MAGIC: Uint8Array                           // "SML1"
```

Usage:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticMagicLink } from 'vite-plugin-static-magic-link'

export default defineConfig({
  plugins: [react(), staticMagicLink()],
})
```

Nothing in app code changes.

## 4. Build output

```
dist/
  index.html              plaintext: Vite's html minus its script/modulepreload tags,
                          plus <script type="module" src="{base}assets/boot-[hash].js">
  assets/boot-[hash].js   plaintext bootstrap (~2.2 KB, ~1.2 KB gzipped)
  assets/app-[hash].enc   encrypted bundle (its filename is baked into boot.js)
  assets/style-[hash].css plaintext stylesheet (css: false, default)
  assets/*.png …          plaintext assets referenced by URL
```

After build, print to stdout:

```
static-magic-link
  share: <base>#key=<base64url>        e.g.  /#key=…  or  /album/#key=…
  test:  vite preview, then open http://localhost:4173<base>#key=<base64url>
```

When `process.env.CI` is set, print `#key=$MAGIC_LINK_KEY` instead of the key so it
stays out of CI logs.

## 5. Encrypted file format (`app-[hash].enc`)

```
offset  size  content
0       4     magic  "SML1" (0x53 0x4D 0x4C 0x31)
4       12    IV, random per build
16      n+16  AES-GCM ciphertext followed by the 16-byte auth tag (WebCrypto layout)
```

- Node side: `crypto.createCipheriv('aes-256-gcm', key, iv)`, then
  `Buffer.concat([magic, iv, ciphertext, cipher.getAuthTag()])`.
- Browser side: `crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, body)`
  where `body` = everything after offset 16. WebCrypto expects the tag appended, which
  matches the layout above.
- Key: 32 bytes. base64url encode/decode without padding
  (`Buffer.from(key, 'base64url')` in Node; manual decode in the browser).
- The magic prefix lets the bootstrap distinguish "wrong key" from "this is not an
  encrypted file" (host served the wrong thing, stale deploy).

## 6. Plugin implementation

One plugin object:

```ts
{
  name: 'vite-plugin-static-magic-link',
  apply: 'build',
  enforce: 'post',
  config(userConfig) { … },         // 6.1
  configResolved(config) { … },     // 6.2
  generateBundle(_, bundle) { … },  // 6.3
  closeBundle() { … },              // 6.4
}
```

### 6.1 `config` hook — force the build shape

Return a partial config that Vite deep-merges:

```ts
return {
  build: {
    sourcemap: false,
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
}
```

- Verified on Vite 8.3.4: `codeSplitting: false` yields exactly one chunk with no
  warning. `build.rollupOptions` is a deprecated alias of `build.rolldownOptions`; the
  `manualChunks` check looks at both.
- When `enabled: false`, the plugin returns no hooks at all (plain Vite build).
- If `userConfig.build?.rollupOptions?.output` is an array, or sets `manualChunks`,
  log a warning (`static-magic-link: manualChunks is ignored, the bundle must be a
  single chunk`) and override.
- If the user set `sourcemap` to anything truthy, warn that it was forced off.
- Verified: with `enforce: 'post'`, `generateBundle` sees
  `["assets/index-[hash].js", "assets/style-[hash].css", "index.html"]`, and the html
  source is Vite's final output with `<script type="module" crossorigin src="…">`
  (note the `crossorigin` attribute between `type` and `src`) and
  `<link rel="stylesheet" crossorigin href="…">`. `this.emitFile({ type: 'asset',
  name: 'boot.js' })` + `this.getFileName(ref)` returns `assets/boot-[hash].js`.

### 6.2 `configResolved` — remember `base`, load the key

- Store `config.base` (e.g. `/` or `/album/`) for the html rewrite and the printed link.
- If `base` does not start with `/` (relative `./`, or a full URL), throw:
  `static-magic-link: base must be an absolute path like "/" or "/album/"`.
- Key: `options.key ?? loadEnv(config.mode, config.envDir, 'MAGIC_LINK_').MAGIC_LINK_KEY`.
  Missing or not 43 base64url chars → throw with a fresh `generateKey()` in the message:
  `Set MAGIC_LINK_KEY, for example in .env.production.local:\n  MAGIC_LINK_KEY=<fresh>`.
- If any `config.envPrefix` is a prefix of `MAGIC_LINK_KEY`, throw (it would expose the
  key to client code).

### 6.3 `generateBundle` — encrypt and rewrite

Runs after all of Vite's build plugins because of `order: 'post'`, so
`bundle['index.html']` exists.

1. **Find the JS chunk.** Exactly one `OutputChunk` with `type === 'chunk'`. If more
   than one, throw: `static-magic-link: expected one chunk, got N (…names). Check that
   nothing overrides the single-chunk output option.`
2. **CSS (only when `css: true`).** Collect every `OutputAsset` whose `fileName` ends
   with `.css`. Concatenate their sources. Prepend to the JS source:
   ```js
   (()=>{const s=document.createElement('style');s.textContent=<JSON.stringify(css)>;document.head.appendChild(s)})();
   ```
   (Statements before `import` declarations are legal in ES modules; with
   `codeSplitting: false` there are no imports anyway.) Delete the CSS assets from
   `bundle`.
3. **Encrypt.** `encrypt(Buffer.from(chunk.code), key)` → emit:
   ```ts
   const encRef = this.emitFile({ type: 'asset', name: 'app.enc', source })
   const encFile = this.getFileName(encRef)   // assets/app-[hash].enc
   ```
   Then `delete bundle[chunk.fileName]`.
4. **Bootstrap.** Build the bootstrap source (section 7) with `encFile`'s basename
   baked in, emit with a content hash:
   ```ts
   const ref = this.emitFile({ type: 'asset', name: 'boot.js', source: bootSrc })
   const bootFile = this.getFileName(ref)   // assets/boot-[hash].js
   ```
5. **Rewrite `index.html`** (`bundle['index.html']` is an `OutputAsset` with a string
   `source`):
   - Remove the `<script type="module" … src="…"></script>` whose `src` ends with the
     entry chunk's `fileName` (attribute order varies; tolerant regex built from the
     escaped filename). Other module scripts in the user's html stay. If it is not
     found, throw.
   - Remove every `<link rel="modulepreload" …>`:
     `/<link\b[^>]*rel="modulepreload"[^>]*>\s*/g`.
   - When `css: true`, remove every `<link rel="stylesheet" …>` whose `href` points
     at a deleted CSS asset.
   - Inject `<script type="module" src="${base}${bootFile}"></script>` before
     `</head>` (fallback: before `</body>`).
   - Also remove the `crossorigin` attribute copies Vite leaves; they are on the
     removed tags only, so nothing extra needed.
6. **Multi-page apps:** out of scope for v1. If more than one `.html` asset exists,
   throw with a clear message.

### 6.4 `closeBundle` — print the share info

Print the block from section 4 using the stored `base` and key. Use `config.logger.info`
so it respects `--silent`.

## 7. Bootstrap (`assets/boot-[hash].js`)

Generated as a template string at build time with two values baked in: `ENC` (the
`app-[hash].enc` basename) and `STORE` (`static-magic-link:` + `base`). Plain ES
module, no bundler, no dependencies, targets evergreen browsers. Approximately:

```js
const ENC = '__ENC__';      // replaced at build time
const STORE = '__STORE__';  // replaced at build time
const MAGIC = [0x53, 0x4d, 0x4c, 0x31];
const MESSAGES = {
  'missing-key': 'This page needs its link. Ask whoever shared it for the full link.',
  'wrong-key': 'This link is not valid. Check that you copied all of it.',
  'bad-file': 'The site files look wrong. Try again later.',
  'no-crypto': 'Open this site over https.',
  'fetch-failed': 'Could not load the site. Check your connection.',
};

function fail(code) {
  const root = document.getElementById('root') || document.body;
  root.innerHTML =
    '<p style="font:16px system-ui;margin:40px auto;max-width:32em;text-align:center">' +
    MESSAGES[code] + '</p>';
  throw new Error('static-magic-link: ' + code);
}

function fromBase64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Blocked storage is fine: links still work, only sub-route reloads lose the key.
const load = () => { try { return localStorage.getItem(STORE); } catch { return null; } };
const save = (k) => { try { localStorage.setItem(STORE, k); } catch {} };
const forget = () => { try { localStorage.removeItem(STORE); } catch {} };

async function decrypt(key, iv, body) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', fromBase64url(key), { name: 'AES-GCM' }, false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, body);
}

async function main() {
  const fromUrl = new URLSearchParams(location.hash.slice(1)).get('key');
  const saved = load();
  if (!fromUrl && !saved) fail('missing-key');
  if (!globalThis.crypto?.subtle) fail('no-crypto');

  let raw;
  try {
    const res = await fetch(new URL('./' + ENC, import.meta.url));
    if (!res.ok) throw new Error(String(res.status));
    raw = new Uint8Array(await res.arrayBuffer());
  } catch { fail('fetch-failed'); }

  if (raw.length < 32 || MAGIC.some((b, i) => raw[i] !== b)) fail('bad-file');
  const iv = raw.subarray(4, 16);
  const body = raw.subarray(16);

  // URL key first; a broken or old link falls back to the saved key.
  let js;
  for (const key of [fromUrl, saved]) {
    if (!key || js) continue;
    try { js = await decrypt(key, iv, body); save(key); } catch {}
  }
  if (!js) {
    if (saved) forget();  // saved key is from before a key change
    fail(fromUrl ? 'wrong-key' : 'missing-key');
  }

  const url = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
  await import(/* @vite-ignore */ url);
}

main();
```

Notes:

- `new URL('./' + ENC, import.meta.url)` resolves relative to the bootstrap's real
  URL, so it works under any `base` without configuration.
- The fragment is left in the URL on purpose (see section 2, "Fragment after load").
  There is no logout.
- The bootstrap is **not** inlined into `index.html` so a strict CSP stays possible.
- Error copy lives here because no app code exists yet when errors happen.
- `import.meta.url` inside the decrypted bundle is a `blob:` URL (see limitations).

## 8. Error handling

| Case | Detection | Code |
| --- | --- | --- |
| No `#key=` and nothing saved | fragment parse → null, `localStorage` empty | `missing-key` |
| Only a saved key, and it no longer decrypts | `subtle.decrypt` rejects | `missing-key` (saved key removed) |
| Not a secure context | `crypto.subtle` undefined | `no-crypto` |
| Network / 404 | fetch throws or `!res.ok` | `fetch-failed` |
| Not an encrypted file | magic prefix mismatch or < 32 bytes (magic + IV + tag) | `bad-file` |
| Wrong key | `subtle.decrypt` rejects (`OperationError`) | `wrong-key` |

All render a centered one-line message into `#root` (fallback `document.body`).
Overridable copy (`messages` option) is deferred.

## 9. Known limitations (accepted for v1)

| Limitation | Why | Accepted because |
| --- | --- | --- |
| No code splitting | one bundle | target sites are small |
| `import.meta.url` is `blob:` inside the app | module loaded from a Blob | rare in app code; libraries using `new URL('./x', import.meta.url)` (workers, WASM) break — README documents it |
| App-spawned Web Workers | worker URL resolves against `blob:` | out of scope |
| Large media stays plaintext | only JS is encrypted | small images inline via `assetsInlineLimit`; raising it is the documented lever |
| Strict CSP needs `script-src blob:` | `import(blobUrl)` | personal sites rarely set a CSP |
| HTTPS required | `crypto.subtle` is secure-context only | `localhost` exempt; real hosts are HTTPS |
| Multi-page apps | one html rewritten | throw with a message; later |
| Key visible to link holders | it is in the URL | by design |
| Key readable by same-origin scripts | stored as a string in `localStorage` | other sites on `you.github.io` can read it; README says use your own (sub)domain |
| iOS forgets the saved key | Safari wipes script-writable storage after 7 days of Safari use without a visit | the link itself (bookmark, history) still carries the key |
| Hash routers (`#/about`) | they share the fragment with `#key=` | work after the first visit via the saved key; README documents it |
| Relative `base` | asset URLs would resolve against `blob:` | throw with a message |

## 10. Repository layout

```
vite-plugin-static-magic-link/
  package.json                 workspace root (npm workspaces)
  SPEC.md                      this file
  README.md                    the only consumer doc; prepack copies it (and LICENSE) into packages/plugin
  packages/plugin/
    package.json               name: vite-plugin-static-magic-link, type: module
    tsup.config.ts             entry src/index.ts, format esm, dts, target node20
    tsconfig.json
    src/
      index.ts                 export { staticMagicLink, generateKey, encrypt, FILE_MAGIC }
      plugin.ts                the Plugin object (sections 6.x)
      crypto.ts                generateKey, encrypt (node:crypto), FILE_MAGIC, base64url helpers
      bootstrap.ts             buildBootstrap(): string  (section 7 as a template)
      html.ts                  rewriteHtml(html, { base, bootFile, entryFile, removeCss })
    test/
      crypto.test.ts           round trip; wrong key rejects
      html.test.ts             tag removal + injection on a realistic Vite index.html
      build.test.ts            vite build of examples/greeting-site; app-*.enc decrypts
  examples/greeting-site/
    package.json               private, vite + react
    vite.config.ts             plugins: [react(), staticMagicLink()]
    index.html                 <div id="root">
    src/main.tsx               BrowserRouter, two React.lazy routes
    src/routes/Home.tsx        renders a 2 KB png (will be inlined) + link to /gallery
    src/routes/Gallery.tsx     renders a 200 KB jpg (stays external)
    src/styles.css             one class with a background url()
    public/large.jpg
    src/assets/small.png
  e2e/
    playwright.config.ts       webServer: vite preview on examples/greeting-site
    magic-link.spec.ts         see section 11
```

Tooling (versions current on 2026-10-12): Node 24, Vite 8.3, tsup 9.0, vitest 5.0,
@playwright/test 1.64. `peerDependencies: { vite: ">=8" }`. ESM only.
TypeScript is pinned to 6.x at the workspace root: TypeScript 7 ships no compiler
API, and tsup's `dts` step needs one.

`packages/plugin/package.json` essentials:

```json
{
  "name": "vite-plugin-static-magic-link",
  "version": "1.3.1",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "peerDependencies": { "vite": ">=8" },
  "engines": { "node": "^20.19.0 || >=22.12.0" }
}
```

## 11. Verification

Keep tests to a minimum (decided 2026-10-19): a few unit tests and one end-to-end test.

Unit (vitest, `packages/plugin/test`):

- `crypto.test.ts`: encrypt→decrypt round trip with WebCrypto (output starts with
  `SML1`); wrong key rejects.
- `html.test.ts`: on a captured Vite `index.html`, the entry script and modulepreload
  links are gone and exactly one boot script is injected.
- `build.test.ts`: `await build({ root: examples/greeting-site, logLevel: 'silent' })`
  with a fixed key; dist has `boot-*.js` and `app-*.enc` and no other `.js`, and
  `app-*.enc` decrypts to code containing `SML_FIXTURE_MARKER`.

End-to-end (Playwright, `e2e/magic-link.spec.ts`), one test against `vite preview` of
the built fixture: open `/#key=<key>` → Home renders → navigate to Gallery → reload →
Gallery still renders (covers decryption, inlined lazy routes, and the saved key).

## 12. Build plan (ordered, each step testable)

- [x] Scaffold: root workspace, `packages/plugin` with tsup + vitest, `examples/greeting-site`, `e2e` with Playwright. `npm run build`, `npm test`, `npm run e2e` wired at the root.
- [x] `crypto.ts` + `crypto.test.ts`.
- [x] `html.ts` + `html.test.ts`.
- [x] `bootstrap.ts` (template string, exported as a function so the key-less file is reproducible).
- [x] `plugin.ts`: `config`, `configResolved`, `generateBundle`, `closeBundle`. `build.test.ts` green.
- [x] Fixture app runs encrypted under `vite preview`; the e2e test green.
- [x] `css: true` path (checked by hand 2026-10-19: no .css in dist, styles and background url() apply).
- [x] README: install, one-line config, options table, output, the one-sentence threat model, limitations.
- [x] Reserve the npm name (published 1.3.1 as the first release, 2026-10-19).

## 13. Later (not v1, do not block)

- `mode: 'sw'` service-worker mode: per-chunk decryption, code splitting, encrypted media by glob. Carries Firefox-private-mode and hard-refresh caveats.
- `singleFile: true`: base64-embed ciphertext into `index.html` for an emailable one-file site.
- `messages: {...}` to override bootstrap copy.
- Multi-page app support.
- Encrypted assets without a worker (build-time URL rewrite to a runtime Blob resolver).
