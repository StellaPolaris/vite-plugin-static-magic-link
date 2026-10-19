<p align="center">
  <img src="https://raw.githubusercontent.com/StellaPolaris/vite-plugin-static-magic-link/main/.github/header.svg" alt="vite-plugin-static-magic-link: a link with #key=… unlocks the site in the browser, while the host, the CDN and crawlers only see scrambled bytes" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vite-plugin-static-magic-link"><img src="https://img.shields.io/npm/v/vite-plugin-static-magic-link" alt="npm version"></a>
  <a href="https://github.com/StellaPolaris/vite-plugin-static-magic-link/blob/main/LICENSE"><img src="https://img.shields.io/github/license/StellaPolaris/vite-plugin-static-magic-link" alt="MIT license"></a>
</p>

# vite-plugin-static-magic-link

**Turn a static Vite site into a link only invited people can open.**

Anyone with the link sees your site. The host, the CDN and search engines see
encrypted bytes. No accounts, no passwords, no backend: you send a link and
they click it.

Made for small personal sites: a photo album for the family, a greeting card, a shared
calendar.

- **One line of config.** Your app code doesn't change, and `vite dev` is untouched.
- **Works on plain static hosting.** Upload `dist/` to any host that serves files over
  HTTPS.
- **Bookmarks and reloads keep working**, even on routes like `/gallery`.
- **Tiny loader.** About 2 KB of plain JavaScript, no dependencies.

## Quick start

Requires Vite 8, Node.js 20.19+ or 22.12+, and HTTPS in production (`localhost` is fine).

**1. Install**

```sh
npm install -D vite-plugin-static-magic-link
```

**2. Add the plugin**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticMagicLink } from 'vite-plugin-static-magic-link'

export default defineConfig({
  plugins: [react(), staticMagicLink()],
})
```

**3. Build, save the key, build again**

```sh
npx vite build   # fails the first time and prints a fresh key
```

Put that key in `.env.production.local` (keep this file out of Git):

```sh
MAGIC_LINK_KEY=<the 43-character key>
```

Run `npx vite build` again. This time it ends with your link:

```
static-magic-link
  share: /#key=<key>
  test:  vite preview, then open http://localhost:4173/#key=<key>
```

**4. Deploy `dist/` and share** `https://your-site.example/#key=<key>`.

That's it. Read on for CI, options and the fine print.

## How it works

At `vite build`, the plugin bundles your JavaScript into a single file and encrypts it
with AES-GCM (Advanced Encryption Standard in Galois/Counter Mode). Vite's script tag
in `index.html` is swapped for a small, readable loader.

When someone opens the link, the loader:

1. reads the key from the part of the URL after `#`. Browsers never send this part to
   the server, so the key never reaches your host;
2. downloads the encrypted file, `assets/app-[hash].enc`;
3. decrypts it in the browser and runs it. Your app starts as usual.

The key stays in the address bar, so bookmarks keep working. The loader also saves it
in `localStorage`, so reloading a page your router navigated to (like `/gallery`,
without the `#key=…`) still works.

If something goes wrong, visitors see one line of text instead of your site: the link
is missing, the key is wrong, the site needs HTTPS, or the files couldn't be loaded.

### What gets published

```
dist/
  index.html              your page, with Vite's script swapped for the loader
  assets/boot-[hash].js   small readable loader (about 2 KB)
  assets/app-[hash].enc   your JavaScript, encrypted
  assets/style-[hash].css your stylesheet (unless css: true)
  assets/*.png, …         images and other files, not encrypted
```

## Set up the key

The key is what makes the link work. Keep it the same across deploys, or links you
already shared stop working.

### On your machine

The plugin reads the key from the `MAGIC_LINK_KEY` environment variable, including
Vite's `.env*` files. The easiest place is `.env.production.local`:

```sh
MAGIC_LINK_KEY=<the 43-character key>
```

Without a key the build fails and prints a fresh one, so the first `npx vite build` is
also how you get one. You can also pass the key directly with the [`key`](#options)
option.

If your site uses a non-root `base`, the link includes it. With `base: '/album/'`, the
link is `https://your-site.example/album/#key=<key>`.

### In CI

In CI (continuous integration), store the key as a secret named `MAGIC_LINK_KEY` and
expose it to the build step. For example, with GitHub Actions:

```yaml
- run: npx vite build
  env:
    MAGIC_LINK_KEY: ${{ secrets.MAGIC_LINK_KEY }}
```

When the `CI` environment variable is set (GitHub Actions sets it for you), the build
prints `#key=$MAGIC_LINK_KEY` instead of the key, so the key stays out of your logs.

## Options

```ts
staticMagicLink({
  key: process.env.MY_KEY,  // default: MAGIC_LINK_KEY
  enabled: true,            // default: true
  css: false,               // default: false
})
```

| Option    | Default          | What it does |
| --------- | ---------------- | ------------ |
| `key`     | `MAGIC_LINK_KEY` | The 43-character base64url key. Read from the environment or `.env*` files by default. The build fails without one. |
| `enabled` | `true`           | `false` builds a plain, unencrypted site with no key needed. For example `staticMagicLink({ enabled: !process.env.PLAIN_BUILD })`, then `PLAIN_BUILD=1 npx vite build` locally. |
| `css`     | `false`          | `true` moves your CSS into the encrypted bundle. By default the stylesheet stays readable. |

## What it protects (and what it doesn't)

It keeps your site's code and content away from anyone without the link: your host,
your CDN (content delivery network), search engines and curious crawlers.

It is **not** security. Anyone with the link can read and copy everything, and you
can't revoke a link except by changing the key and redeploying. Treat the link like a
house key you hand to friends.

Also worth knowing:

- **Images and other files aren't encrypted.** Small images (under Vite's
  `build.assetsInlineLimit`, 4 KB by default) are inlined into the encrypted bundle.
  Raise that limit to pull in more.
- **Other sites on the same origin can read the saved key.** Browsers isolate storage
  by domain, not by path. If you host on a shared domain like `you.github.io`, use your
  own (sub)domain.
- **iPhones forget the saved key.** Safari deletes site storage after 7 days of use
  without a visit. The link itself (bookmark, history) keeps working.

## Limitations

- **One bundle.** The plugin turns off code splitting. Lazy routes still work, but
  everything downloads up front.
- **Absolute `base` only** (`/` or `/album/`). A relative `base: './'` fails the build.
- **One HTML page.** Multi-page apps fail the build, and so do SSR (server-side
  rendering) and library builds.
- **`import.meta.url` is a `blob:` URL inside your app.** Code that resolves files with
  `new URL('./file', import.meta.url)` (some Web Worker and WebAssembly setups) breaks.
- **Hash routers** (`#/about`) share the fragment with `#key=…`. They work after the
  first visit, once the key is saved.
- **Content Security Policy (CSP):** if you set one, `script-src` needs `blob:`.
- **No source maps.** They would contain your plaintext code, so the plugin turns them
  off.

## License

[MIT](https://github.com/StellaPolaris/vite-plugin-static-magic-link/blob/main/LICENSE)
