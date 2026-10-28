import crypto from 'node:crypto'
import { config } from './config.mjs'
import {
  createAuthSession,
  deleteAuthSession,
  getAuthSession,
  getUserById,
} from './db.mjs'
import { randomToken, sha256 } from './security.mjs'

export const COOKIE_NAME = 'teamos_session'

export function parseCookies(header) {
  const result = {}
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!key) continue
    try {
      result[key] = decodeURIComponent(value)
    } catch {
      result[key] = value
    }
  }
  return result
}

function cookieFlags(maxAge) {
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    config.cookieSecure ? 'Secure' : '',
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join('; ')
}

export function createSessionCookie(userId) {
  const token = randomToken(32)
  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400000).toISOString()
  createAuthSession(tokenHash, userId, expiresAt)
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieFlags(config.sessionDays * 86400)}`
}

export function clearSessionCookie(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (token) deleteAuthSession(sha256(token))
  return `${COOKIE_NAME}=; ${cookieFlags(0)}`
}

export function currentSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return null
  const row = getAuthSession(sha256(token))
  if (!row || row.status !== 'active') return null
  return row
}

export function requireUser(req) {
  return currentSession(req)
}

export function isAdmin(user) {
  return user?.role === 'admin'
}

export function newId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

export function userSummary(user) {
  if (!user) return null
  return {
    id: user.id,
    memberId: user.member_id,
    email: user.email,
    role: user.role,
    status: user.status,
  }
}

export function userById(id) {
  return getUserById(id)
}
