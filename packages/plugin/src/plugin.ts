import type { Plugin } from 'vite'

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

// Scaffold only: the hooks from SPEC.md section 6 land in build-plan step 5.
export function staticMagicLink(_options: StaticMagicLinkOptions = {}): Plugin {
  return {
    name: 'vite-plugin-static-magic-link',
    apply: 'build',
    enforce: 'post',
  }
}
