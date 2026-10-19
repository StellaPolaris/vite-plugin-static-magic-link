import { createCipheriv, randomBytes } from 'node:crypto'

/** "SML1": first 4 bytes of every app-[hash].enc (SPEC.md section 5). */
export const FILE_MAGIC: Uint8Array = new Uint8Array([0x53, 0x4d, 0x4c, 0x31])

const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** A fresh random 32-byte key as base64url (43 chars, no padding). */
export function generateKey(): string {
  return randomBytes(32).toString('base64url')
}

/** The 32 key bytes, or null if `key` is not a 43-char base64url string. */
export function parseKey(key: string): Buffer | null {
  return KEY_PATTERN.test(key) ? Buffer.from(key, 'base64url') : null
}

/** AES-256-GCM: magic, 12-byte IV, ciphertext, 16-byte tag (the WebCrypto layout). */
export function encrypt(plain: Uint8Array, key: string): Uint8Array<ArrayBuffer> {
  const keyBytes = parseKey(key)
  if (!keyBytes) throw new Error('static-magic-link: key must be 43 base64url characters (32 bytes)')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBytes, iv)
  return new Uint8Array(Buffer.concat([FILE_MAGIC, iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]))
}
