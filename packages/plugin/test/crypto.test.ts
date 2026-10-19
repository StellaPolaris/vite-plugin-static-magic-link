import { expect, test } from 'vitest'
import { encrypt, FILE_MAGIC, generateKey } from '../src/crypto'

// Decrypt the way the bootstrap does, with WebCrypto.
async function decrypt(file: Uint8Array<ArrayBuffer>, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', Buffer.from(key, 'base64url'), { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.subarray(4, 16) }, cryptoKey, file.subarray(16))
  return new TextDecoder().decode(plain)
}

test('round trip through WebCrypto', async () => {
  const key = generateKey()
  const file = encrypt(new TextEncoder().encode('console.log("hi")'), key)
  expect(file.subarray(0, 4)).toEqual(FILE_MAGIC)
  expect(await decrypt(file, key)).toBe('console.log("hi")')
})

test('wrong key rejects', async () => {
  const file = encrypt(new TextEncoder().encode('secret'), generateKey())
  await expect(decrypt(file, generateKey())).rejects.toThrow()
})
