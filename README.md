# vite-plugin-static-magic-link

Turn a static Vite site into a link only invited people can open. The host, the CDN
and search engines see encrypted bytes; anyone with the link sees your site.

Made for small personal sites: a photo album, a shared calendar, a greeting card.

```sh
npm install -D vite-plugin-static-magic-link
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticMagicLink } from 'vite-plugin-static-magic-link'

export default defineConfig({
  plugins: [react(), staticMagicLink()],
})
```

Your app code doesn't change. `vite dev` is untouched.

Requires Vite 8, Node.js 20.19+ or 22.12+, and HTTPS in production (`localhost` is fine).

## Set up the key

The key is what makes the link work. Keep it the same across deploys, or links you
already shared stop working.

1. Run `npx vite build` once. Without a key the build fails and prints a fresh one.
2. Save it in `.env.production.local` (keep this file out of Git):

   ```sh
   MAGIC_LINK_KEY=<the 43-character key>
   ```

3. Build again. The output ends with your link:

   ```
   static-magic-link
     share: /#key=<key>
     test:  vite preview, then open http://localhost:4173/#key=<key>
   ```

Share `https://your-site.example/#key=<key>`. With `base: '/album/'`, the link is
`https://your-site.example/album/#key=<key>`.

**In CI (continuous integration)**, store the key as a secret named `MAGIC_LINK_KEY`
(for example, a GitHub Actions secret) and expose it to the build step. When the `CI`
environment variable is set, the build prints `#key=$MAGIC_LINK_KEY` instead of the key,
so it stays out of logs.

## Options

| Option    | Default          | What it does |
| --------- | ---------------- | ------------ |
| `key`     | `MAGIC_LINK_KEY` | The 43-character base64url key. Read from the environment or `.env*` files by default. The build fails without one. |
| `enabled` | `true`           | `false` builds a plain, unencrypted site with no key needed. For example `staticMagicLink({ enabled: !process.env.PLAIN_BUILD })`, then `PLAIN_BUILD=1 npx vite build` locally. |
| `css`     | `false`          | `true` moves your CSS into the encrypted bundle. By default the stylesheet stays readable. |

## What gets published

```
dist/
  index.html              your page, with Vite's script swapped for the loader
  assets/boot-[hash].js   small readable loader (about 2 KB)
  assets/app-[hash].enc   your JavaScript, encrypted
  assets/style-[hash].css your stylesheet (unless css: true)
  assets/*.png, …         images and other files, not encrypted
```

When someone opens the link, the loader reads the key from the part after `#` (browsers
never send it to the server), downloads `app-[hash].enc`, decrypts it in the browser
with AES-GCM (Advanced Encryption Standard in Galois/Counter Mode), and runs it.

The key stays in the address bar, so bookmarks keep working. The loader also saves it in
`localStorage`, so reloading a page your router navigated to (like `/gallery`, without
the `#key=…`) still works.

If something goes wrong, visitors see one line of text instead of your site: the link
is missing, the key is wrong, the site needs HTTPS, or the files couldn't be loaded.

## What it protects

It keeps your site's code and content away from anyone without the link. It is **not**
security: anyone with the link can read and copy everything, and you can't revoke a
link except by changing the key and redeploying.

Also worth knowing:

- **Images and other files aren't encrypted.** Small images (under Vite's
  `build.assetsInlineLimit`, 4 KB by default) are inlined into the encrypted bundle.
  Raise that limit to pull in more.
- **Other sites on the same origin can read the saved key.** Browsers isolate storage by
  domain, not by path. If you host on a shared domain like `you.github.io`, use your own
  (sub)domain.
- **iPhones forget the saved key.** Safari deletes site storage after 7 days of use
  without a visit. The link itself (bookmark, history) keeps working.

## Limitations

- **One bundle.** The plugin turns off code splitting. Lazy routes still work, but
  everything downloads up front.
- **Absolute `base` only** (`/` or `/album/`). A relative `base: './'` fails the build.
- **One HTML page.** Multi-page apps fail the build.
- **`import.meta.url` is a `blob:` URL inside your app.** Code that resolves files with
  `new URL('./file', import.meta.url)` (some Web Worker and WebAssembly setups) breaks.
- **Hash routers** (`#/about`) share the fragment with `#key=…`. They work after the
  first visit, once the key is saved.
- **Content Security Policy (CSP):** if you set one, `script-src` needs `blob:`.
- **No source maps.** They would contain your plaintext code, so the plugin turns them off.

## License

MIT
