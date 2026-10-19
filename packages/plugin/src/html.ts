export interface RewriteHtmlOptions {
  /** Vite's resolved base, e.g. "/" or "/album/". */
  base: string
  /** The bootstrap's bundle fileName, e.g. "assets/boot-abc123.js". */
  bootFile: string
  /** The entry chunk's fileName whose <script> tag is removed. */
  entryFile: string
  /** Bundle fileNames of stylesheets to unlink (css: true). */
  removeCss?: string[]
}

const endsWithFile = (tag: string, attr: string, file: string): boolean =>
  new RegExp(`\\b${attr}="[^"]*\\/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(tag)

/** Swap Vite's entry script for the bootstrap (SPEC.md section 6.3, step 5). */
export function rewriteHtml(html: string, options: RewriteHtmlOptions): string {
  const { base, bootFile, entryFile, removeCss = [] } = options

  let found = false
  let out = html.replace(/<script\b[^>]*><\/script>\s*/g, (tag) => {
    if (!endsWithFile(tag, 'src', entryFile)) return tag
    found = true
    return ''
  })
  if (!found) throw new Error(`static-magic-link: can't find the <script> for ${entryFile} in index.html`)

  out = out.replace(/<link\b[^>]*>\s*/g, (tag) =>
    /\brel="modulepreload"/.test(tag) || removeCss.some((file) => endsWithFile(tag, 'href', file)) ? '' : tag,
  )

  const boot = `<script type="module" src="${base}${bootFile}"></script>\n`
  if (out.includes('</head>')) return out.replace('</head>', `  ${boot}  </head>`)
  if (out.includes('</body>')) return out.replace('</body>', `${boot}</body>`)
  throw new Error('static-magic-link: index.html needs a </head> or </body> tag')
}
