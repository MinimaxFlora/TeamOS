import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { config, dataPath } from './config.mjs'
import { decryptText, encryptText, sha256 } from './security.mjs'

const db = new DatabaseSync(dataPath('teamos.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin','member')),
    status TEXT NOT NULL CHECK (status IN ('active','invited','disabled')),
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
  CREATE TABLE IF NOT EXISTS connector_secrets (
    id TEXT PRIMARY KEY,
    endpoint_enc TEXT,
    secret_enc TEXT,
    secret_hint TEXT,
    endpoint_hint TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected',
    signature INTEGER NOT NULL DEFAULT 0,
    scopes TEXT NOT NULL DEFAULT '[]',
    events INTEGER NOT NULL DEFAULT 0,
    last_event_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT,
    payload_enc TEXT,
    signature_valid INTEGER NOT NULL,
    received_at TEXT NOT NULL,
    UNIQUE (connector_id, event_id)
  );
  CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    kind TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'chat',
    text TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
`)

const seedPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed.json')

function migrateUsersStatus() {
  // Registration now creates pending accounts that an admin must approve.
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()
  if (!row || String(row.sql).includes("'pending'")) return
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    db.exec('BEGIN')
    db.exec(`CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin','member')),
      status TEXT NOT NULL CHECK (status IN ('active','invited','pending','disabled')),
      created_at TEXT NOT NULL,
      last_login_at TEXT
    )`)
    db.exec(
      'INSERT INTO users_new (id, member_id, email, password_hash, role, status, created_at, last_login_at) SELECT id, member_id, email, password_hash, role, status, created_at, last_login_at FROM users',
    )
    db.exec('DROP TABLE users')
    db.exec('ALTER TABLE users_new RENAME TO users')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

migrateUsersStatus()
const fallbackState = {
  company: {
    name: '我的公司',
    shortName: '公司',
    adminEmail: '',
    timezone: '(UTC+08:00) 中国标准时间',
    plan: '私有部署',
    deployment: '客户独立 VPS',
    createdAt: new Date().toISOString(),
  },
  members: [],
  agents: [],
  skills: [],
  groups: [{ id: 'g_all', name: '公司大厅', purpose: '全员', memberIds: [], agentIds: [], visibility: 'public', unread: 0, updatedAt: new Date().toISOString(), kind: 'group' }],
  sessions: [],
  activeSessionId: '',
  messages: [],
  runs: [],
  knowledge: [],
  knowledgeDocs: [],
  meetings: [],
  connectors: [],
  audit: [],
  currentUserId: null,
}

function loadSeed() {
  try {
    return JSON.parse(fs.readFileSync(seedPath, 'utf8'))
  } catch {
    return fallbackState
  }
}

const emptyState = db.prepare('SELECT COUNT(*) AS n FROM app_state').get().n === 0
if (emptyState) {
  db.prepare(
    'INSERT INTO app_state (id, revision, json, updated_at) VALUES (1, 1, ?, ?)',
  ).run(JSON.stringify(loadSeed()), new Date().toISOString())
}

// 没有账号的实例还没有用户数据；把早期演示种子替换成干净的初始状态，
// 避免客户第一次登录就看到别人的公司与成员。
const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0
if (!hasUsers) {
  db.prepare('UPDATE app_state SET json = ?, revision = revision + 1, updated_at = ? WHERE id = 1').run(
    JSON.stringify(loadSeed()),
    new Date().toISOString(),
  )
  db.exec('DELETE FROM webhook_events')
  db.exec('DELETE FROM connector_secrets')
}

for (const connector of getRawState().state.connectors ?? []) {
  const exists = db.prepare('SELECT 1 AS n FROM connector_secrets WHERE id = ?').get(connector.id)
  if (!exists) {
    db.prepare(
      `INSERT INTO connector_secrets
       (id, secret_hint, endpoint_hint, status, signature, scopes, events, last_event_at, updated_at)
       VALUES (?, ?, ?, 'disconnected', ?, ?, ?, ?, ?)`,
    ).run(
      connector.id,
      connector.secretHint || '',
      connector.endpointHint || '',
      connector.signature ? 1 : 0,
      JSON.stringify(connector.scopes ?? []),
      connector.events ?? 0,
      connector.lastEventAt ?? null,
      new Date().toISOString(),
    )
  }
}

export function getRawState() {
  const row = db.prepare('SELECT json, revision FROM app_state WHERE id = 1').get()
  return { state: JSON.parse(row.json), revision: row.revision }
}

export function getState() {
  const { state } = getRawState()
  return overlayConnectors(state)
}

function overlayConnectors(state) {
  const rows = db.prepare('SELECT * FROM connector_secrets').all()
  const byId = new Map(rows.map((row) => [row.id, row]))
  return {
    ...state,
    connectors: (state.connectors ?? []).map((connector) => {
      const row = byId.get(connector.id)
      if (!row) return connector
      return {
        ...connector,
        status: row.status === 'connected' ? 'connected' : 'disconnected',
        signature: Boolean(row.signature),
        scopes: safeJson(row.scopes, []),
        events: Number(row.events || 0),
        lastEventAt: row.last_event_at ?? undefined,
        endpointHint: row.endpoint_hint || connector.endpointHint || '',
        secretSet: Boolean(row.secret_enc),
        secretHint: row.secret_hint || connector.secretHint || '',
      }
    }),
  }
}

export function saveState(state, { syncConnectors = false } = {}) {
  const now = new Date().toISOString()
  if (syncConnectors) syncConnectorRows(state)
  const current = db.prepare('SELECT revision FROM app_state WHERE id = 1').get()
  const revision = Number(current.revision) + 1
  db.prepare('UPDATE app_state SET revision = ?, json = ?, updated_at = ? WHERE id = 1').run(
    revision,
    JSON.stringify(state),
    now,
  )
  return revision
}

export function updateState(mutator) {
  const { state } = getRawState()
  const next = mutator(state) ?? state
  const revision = saveState(next)
  return { state: next, revision }
}

function syncConnectorRows(state) {
  const ids = new Set()
  const now = new Date().toISOString()
  for (const connector of state.connectors ?? []) {
    ids.add(connector.id)
    const exists = db.prepare('SELECT id, secret_enc FROM connector_secrets WHERE id = ?').get(connector.id)
    if (!exists) {
      db.prepare(
        `INSERT INTO connector_secrets
         (id, secret_hint, endpoint_hint, status, signature, scopes, events, last_event_at, updated_at)
         VALUES (?, ?, ?, 'disconnected', ?, ?, ?, ?, ?)`,
      ).run(
        connector.id,
        connector.secretHint || '',
        connector.endpointHint || '',
        connector.signature ? 1 : 0,
        JSON.stringify(connector.scopes ?? []),
        connector.events ?? 0,
        connector.lastEventAt ?? null,
        now,
      )
      continue
    }
    const status = exists.secret_enc && connector.status === 'connected' ? 'connected' : 'disconnected'
    db.prepare(
      `UPDATE connector_secrets
       SET endpoint_hint = ?, status = ?, signature = ?, scopes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      connector.endpointHint || '',
      status,
      connector.signature ? 1 : 0,
      JSON.stringify(connector.scopes ?? []),
      now,
      connector.id,
    )
  }
  for (const row of db.prepare('SELECT id FROM connector_secrets').all()) {
    if (!ids.has(row.id)) db.prepare('DELETE FROM connector_secrets WHERE id = ?').run(row.id)
  }
}

export function resetConnectorRuntime() {
  db.exec('DELETE FROM webhook_events')
  db.prepare(
    `UPDATE connector_secrets
     SET endpoint_enc = NULL, secret_enc = NULL, secret_hint = '', endpoint_hint = '',
         status = 'disconnected', events = 0, last_event_at = NULL, updated_at = ?`,
  ).run(new Date().toISOString())
}

export function resetState(nextState) {
  const revision = saveState(nextState, { syncConnectors: true })
  db.exec('DELETE FROM webhook_events')
  return revision
}

export function getConnector(id) {
  return db.prepare('SELECT * FROM connector_secrets WHERE id = ?').get(id)
}

export function listConnectors() {
  return db.prepare('SELECT * FROM connector_secrets').all()
}

export function saveConnectorConfig(id, patch) {
  const current = getConnector(id)
  if (!current) return null
  const endpointEnc = patch.endpoint !== undefined ? encryptText(patch.endpoint) : current.endpoint_enc
  const secretEnc = patch.secret !== undefined ? encryptText(patch.secret) : current.secret_enc
  const secretHint =
    patch.secret !== undefined
      ? `•••• ${String(patch.secret).slice(-4)}`
      : current.secret_hint
  const endpointHint = patch.endpointHint !== undefined ? patch.endpointHint : current.endpoint_hint
  const status =
    patch.status !== undefined
      ? patch.status === 'connected'
        ? 'connected'
        : 'disconnected'
      : current.status
  const signature = patch.signature !== undefined ? (patch.signature ? 1 : 0) : current.signature
  const scopes = patch.scopes !== undefined ? JSON.stringify(patch.scopes) : current.scopes
  db.prepare(
    `UPDATE connector_secrets
     SET endpoint_enc = ?, secret_enc = ?, secret_hint = ?, endpoint_hint = ?,
         status = ?, signature = ?, scopes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    endpointEnc,
    secretEnc,
    secretHint,
    endpointHint,
    status,
    signature,
    scopes,
    new Date().toISOString(),
    id,
  )
  return getConnector(id)
}

export function connectorSecret(id) {
  const row = getConnector(id)
  if (!row) return null
  return {
    ...row,
    endpoint: decryptText(row.endpoint_enc),
    secret: decryptText(row.secret_enc),
    scopes: safeJson(row.scopes, []),
  }
}

export function recordConnectorEvent(id) {
  db.prepare(
    `UPDATE connector_secrets SET events = events + 1, last_event_at = ?, updated_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), new Date().toISOString(), id)
}

export function insertWebhookEvent({ connectorId, eventId, eventType, payload, signatureValid }) {
  const id = `evt_${sha256(`${connectorId}:${eventId}`).slice(0, 24)}`
  try {
    db.prepare(
      `INSERT INTO webhook_events
       (id, connector_id, event_id, event_type, payload_enc, signature_valid, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      connectorId,
      eventId,
      eventType ?? null,
      encryptText(JSON.stringify(payload).slice(0, 65536)),
      signatureValid ? 1 : 0,
      new Date().toISOString(),
    )
    recordConnectorEvent(connectorId)
    return { id, deduped: false }
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return { id, deduped: true }
    throw error
  }
}

export function recentWebhookEvents(connectorId, limit = 20) {
  return db
    .prepare(
      'SELECT id, connector_id, event_id, event_type, signature_valid, received_at FROM webhook_events WHERE connector_id = ? ORDER BY received_at DESC LIMIT ?',
    )
    .all(connectorId, limit)
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase())
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

export function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n
}

export function createUser({ id, memberId, email, passwordHash, role, status }) {
  db.prepare(
    `INSERT INTO users (id, member_id, email, password_hash, role, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, memberId, String(email).toLowerCase(), passwordHash ?? null, role, status, new Date().toISOString())
}

export function updateUser(id, patch) {
  const fields = []
  const values = []
  for (const [key, value] of Object.entries(patch)) {
    if (!['role', 'status', 'password_hash', 'last_login_at'].includes(key)) continue
    fields.push(`${key} = ?`)
    values.push(value)
  }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function listUsers() {
  return db.prepare('SELECT * FROM users').all()
}

export function createAuthSession(tokenHash, userId, expiresAt) {
  db.prepare(
    'INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash, userId, new Date().toISOString(), expiresAt)
}

export function getAuthSession(tokenHash) {
  const row = db
    .prepare(
      `SELECT s.token_hash, s.expires_at, u.* FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash)
  if (!row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash)
    return null
  }
  return row
}

export function deleteAuthSession(tokenHash) {
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash)
}

export function deleteUserSessions(userId) {
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId)
}

export function deleteUser(id) {
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row) return null
  const plain = decryptText(row.value)
  if (!plain) return null
  try {
    return JSON.parse(plain)
  } catch {
    return null
  }
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, encryptText(JSON.stringify(value)), new Date().toISOString())
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function insertFile({ id, ownerId, name, mime, size, sha256, kind, purpose, text }) {
  db.prepare(
    `INSERT INTO files (id, owner_id, name, mime, size, sha256, kind, purpose, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, ownerId, name, mime, Number(size), sha256, kind, purpose ?? 'chat', text ?? null, new Date().toISOString())
  return getFileRow(id)
}

export function getFileRow(id) {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id) ?? null
}

export function updateFileRow(id, patch) {
  const fields = []
  const values = []
  for (const [key, value] of Object.entries(patch)) {
    if (!['name', 'text', 'kind', 'purpose'].includes(key)) continue
    fields.push(`${key} = ?`)
    values.push(value)
  }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE files SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteFileRow(id) {
  db.prepare('DELETE FROM files WHERE id = ?').run(id)
}

export function allFiles() {
  return db.prepare('SELECT * FROM files').all()
}

export { db }
