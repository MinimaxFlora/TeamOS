import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '..')

function bool(value, fallback = false) {
  if (value === undefined) return fallback
  return /^(1|true|yes|on)$/i.test(String(value))
}

export const config = {
  port: Number(process.env.PORT || 8080),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(ROOT, '.teamos-data')),
  publicDir: path.resolve(process.env.PUBLIC_DIR || path.join(ROOT, 'dist')),
  sessionDays: Math.max(1, Number(process.env.SESSION_DAYS || 14)),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  trustProxy: bool(process.env.TRUST_PROXY, true),
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 12 * 1024 * 1024),
  hermes: {
    autoStart: bool(process.env.HERMES_AUTO_START, true),
    bin: process.env.HERMES_BIN || '/opt/hermes/.venv/bin/hermes',
    home: process.env.HERMES_HOME || '/opt/data',
    baseUrl: (process.env.HERMES_BASE_URL || 'http://127.0.0.1:8642').replace(/\/+$/, ''),
    port: Number(process.env.API_SERVER_PORT || 8642),
    host: process.env.API_SERVER_HOST || '127.0.0.1',
    timeoutMs: Number(process.env.HERMES_TIMEOUT_MS || 180000),
  },
  model: {
    systemMaxTokens: Number(process.env.MODEL_MAX_TOKENS || 4096),
    meetingMaxTokens: Number(process.env.MEETING_MAX_TOKENS || 1800),
  },
}

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
fs.mkdirSync(path.join(config.dataDir, 'logs'), { recursive: true, mode: 0o700 })

function readOrCreateMasterKey() {
  const envKey = process.env.TEAMOS_SECRET_KEY?.trim()
  if (envKey) {
    if (/^[0-9a-f]{64}$/i.test(envKey)) return Buffer.from(envKey, 'hex')
    const raw = Buffer.from(envKey, 'base64')
    if (raw.length === 32) return raw
    if (Buffer.byteLength(envKey) === 32) return Buffer.from(envKey, 'utf8')
    throw new Error('TEAMOS_SECRET_KEY must be 32 bytes (64 hex chars, base64, or 32 UTF-8 characters)')
  }
  const keyPath = path.join(config.dataDir, 'master.key')
  if (fs.existsSync(keyPath)) {
    const value = fs.readFileSync(keyPath, 'utf8').trim()
    if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex')
    throw new Error('master.key is invalid')
  }
  const key = crypto.randomBytes(32)
  fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 })
  return key
}

export const masterKey = readOrCreateMasterKey()

function hermesHomeApiKey() {
  // Hermes loads $HERMES_HOME/.env with override=True, so the gateway running
  // inside the image may be using the key written there by stage2. TeamOS must
  // send that same key when the gateway was started outside this process.
  const envPath = path.join(config.hermes.home, '.env')
  try {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const match = /^API_SERVER_KEY=(.*)$/.exec(line.trim())
      if (match && match[1].trim()) return match[1].trim()
    }
  } catch {
    // No Hermes env file: fall back to a TeamOS-generated key.
  }
  return null
}

export function hermesApiKey() {
  const fromEnv = process.env.API_SERVER_KEY?.trim()
  if (fromEnv) return fromEnv
  const fromHome = hermesHomeApiKey()
  if (fromHome) return fromHome
  const keyPath = path.join(config.dataDir, 'hermes-api.key')
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8').trim()
  const key = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(keyPath, key, { mode: 0o600 })
  return key
}

export function dataPath(...parts) {
  return path.join(config.dataDir, ...parts)
}
