import crypto from 'node:crypto'
import { masterKey } from './config.mjs'

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(password), salt, 32, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    })
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function encryptText(plain) {
  if (plain === null || plain === undefined || plain === '') return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

export function decryptText(payload) {
  if (!payload) return ''
  try {
    const [version, ivB64, tagB64, dataB64] = String(payload).split('.')
    if (version !== 'v1') return ''
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivB64, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return ''
  }
}

export function hmacHex(algorithm, key, value) {
  return crypto.createHmac(algorithm, key).update(value).digest('hex')
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function maskSecret(secret) {
  const value = String(secret || '')
  return value.length >= 4 ? `•••• ${value.slice(-4)}` : '••••'
}

export function sanitizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}
